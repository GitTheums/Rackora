import {
  agentDetailResponseSchema,
  agentListResponseSchema,
  agentResponseSchema,
  authMeResponseSchema,
  connectionTestResultSchema,
  createEnrollmentTokenRequestSchema,
  createProxmoxIntegrationSchema,
  csrfResponseSchema,
  dashboardOverviewSchema,
  dockerAgentListResponseSchema,
  dockerContainerDetailResponseSchema,
  dockerContainerListResponseSchema,
  dockerFleetSummarySchema,
  enrollmentTokenListResponseSchema,
  enrollmentTokenResponseSchema,
  hostDetailResponseSchema,
  hostListResponseSchema,
  infrastructureSchema,
  integrationListResponseSchema,
  integrationResponseSchema,
  setupRequestSchema,
  setupStatusResponseSchema,
  loginRequestSchema,
  testProxmoxConnectionSchema,
  updateProxmoxIntegrationSchema,
  userResponseSchema,
  type CreateEnrollmentTokenInput,
  type CreateProxmoxIntegration,
  type TestProxmoxConnection,
  type UpdateProxmoxIntegration,
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

export async function listIntegrations() {
  return requestJson("/api/integrations", integrationListResponseSchema);
}

export async function testProxmoxConnection(
  config: TestProxmoxConnection,
  csrfToken: string,
) {
  const payload = testProxmoxConnectionSchema.parse(config);
  return requestJson("/api/integrations/proxmox/test", connectionTestResultSchema, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });
}

export async function createProxmoxIntegration(
  input: CreateProxmoxIntegration,
  csrfToken: string,
) {
  const payload = createProxmoxIntegrationSchema.parse(input);
  return requestJson("/api/integrations/proxmox", integrationResponseSchema, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });
}

export async function updateProxmoxIntegration(
  id: string,
  input: UpdateProxmoxIntegration,
  csrfToken: string,
) {
  const payload = updateProxmoxIntegrationSchema.parse(input);
  return requestJson(
    `/api/integrations/${id}`,
    integrationResponseSchema,
    {
      method: "PATCH",
      headers: {
        ...JSON_HEADERS,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteIntegration(id: string, csrfToken: string) {
  let response: Response;
  try {
    response = await fetch(`/api/integrations/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    });
  } catch (error) {
    throw new ApiError(formatDevError(error, "Delete failed"), 0);
  }

  if (!response.ok) {
    throw new ApiError(
      import.meta.env.DEV
        ? `Delete failed (${response.status})`
        : "Delete failed",
      response.status,
    );
  }
}

export async function getInfrastructure() {
  return requestJson("/api/infrastructure", infrastructureSchema);
}

export async function getOverview() {
  return requestJson("/api/overview", dashboardOverviewSchema);
}

export async function listAgents() {
  return requestJson("/api/agents", agentListResponseSchema);
}

export async function getAgent(agentId: string) {
  return requestJson(`/api/agents/${agentId}`, agentDetailResponseSchema);
}

export async function listEnrollmentTokens(pendingOnly = false) {
  const url = pendingOnly
    ? "/api/agents/enrollment-tokens?status=pending"
    : "/api/agents/enrollment-tokens";
  return requestJson(url, enrollmentTokenListResponseSchema);
}

export async function createEnrollmentToken(
  input: CreateEnrollmentTokenInput,
  csrfToken: string,
) {
  const payload = createEnrollmentTokenRequestSchema.parse(input);
  return requestJson(
    "/api/agents/enrollment-tokens",
    enrollmentTokenResponseSchema,
    {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        agentName: payload.agentName,
        expiresAt: payload.expiresAt,
      }),
    },
  );
}

export async function revokeAgent(agentId: string, csrfToken: string) {
  return requestJson(`/api/agents/${agentId}/revoke`, agentResponseSchema, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({}),
  });
}

export async function getDockerSummary() {
  return requestJson("/api/docker/summary", dockerFleetSummarySchema);
}

export async function listDockerAgents() {
  return requestJson("/api/docker/agents", dockerAgentListResponseSchema);
}

export async function listDockerContainers() {
  return requestJson("/api/docker/containers", dockerContainerListResponseSchema);
}

export async function getDockerContainer(agentId: string, containerId: string) {
  return requestJson(
    `/api/docker/containers/${agentId}/${containerId}`,
    dockerContainerDetailResponseSchema,
  );
}

export async function listHosts() {
  return requestJson("/api/hosts", hostListResponseSchema);
}

export async function getHost(agentId: string) {
  return requestJson(`/api/hosts/${agentId}`, hostDetailResponseSchema);
}

export { formatDevError };
