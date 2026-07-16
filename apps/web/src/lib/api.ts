import {
  authMeResponseSchema,
  csrfResponseSchema,
  setupRequestSchema,
  setupStatusResponseSchema,
  loginRequestSchema,
  userResponseSchema,
} from "@rackora/shared";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function formatDevError(error: unknown, fallback: string): string {
  if (import.meta.env.DEV && error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

async function parseJson<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      const message = import.meta.env.DEV
        ? `Invalid JSON response (${response.status}): ${rawBody.slice(0, 200)}`
        : "Request failed";
      throw new ApiError(message, response.status);
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : import.meta.env.DEV
          ? `Request failed (${response.status})`
          : "Request failed";
    throw new ApiError(message, response.status);
  }

  try {
    return schema.parse(body);
  } catch (error) {
    const message = import.meta.env.DEV
      ? `Invalid API response: ${error instanceof Error ? error.message : "schema mismatch"}`
      : "Request failed";
    throw new ApiError(message, response.status);
  }
}

async function requestJson<T>(
  url: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch (error) {
    throw new ApiError(
      formatDevError(error, "Network request failed"),
      0,
    );
  }

  return parseJson(response, schema);
}

export async function getSetupStatus() {
  return requestJson("/api/setup/status", setupStatusResponseSchema);
}

export async function completeSetup(input: {
  username: string;
  password: string;
  csrfToken: string;
}) {
  const payload = setupRequestSchema.parse({
    username: input.username,
    password: input.password,
  });

  return requestJson("/api/setup", userResponseSchema, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "X-CSRF-Token": input.csrfToken,
    },
    body: JSON.stringify(payload),
  });
}

export async function getCsrfToken() {
  return requestJson("/api/auth/csrf", csrfResponseSchema);
}

export async function login(input: {
  username: string;
  password: string;
  csrfToken: string;
}) {
  const payload = loginRequestSchema.parse({
    username: input.username,
    password: input.password,
  });

  return requestJson("/api/auth/login", userResponseSchema, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "X-CSRF-Token": input.csrfToken,
    },
    body: JSON.stringify(payload),
  });
}

export async function getCurrentUser() {
  return requestJson("/api/auth/me", authMeResponseSchema);
}

export async function logout(csrfToken: string) {
  let response: Response;

  try {
    response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    });
  } catch (error) {
    throw new ApiError(formatDevError(error, "Logout failed"), 0);
  }

  if (!response.ok) {
    throw new ApiError(
      import.meta.env.DEV
        ? `Logout failed (${response.status})`
        : "Logout failed",
      response.status,
    );
  }
}

export { formatDevError };
