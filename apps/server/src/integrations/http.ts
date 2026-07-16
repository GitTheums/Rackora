import { Agent, fetch as undiciFetch } from "undici";
import type { TlsMode } from "@rackora/shared";
import { assertSafeOutboundUrl, redactUrl } from "./ssrf.js";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 250;

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    dispatcher?: Agent;
  },
) => Promise<Response>;

export type SafeFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  tlsMode?: TlsMode;
  customCa?: string;
  /** Global gate for insecure TLS (ALLOW_INSECURE_TLS). */
  allowInsecureTls?: boolean;
  fetchImpl?: FetchLike;
};

export class HttpRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HttpRequestError";
    this.status = status;
  }
}

function createDispatcher(
  tlsMode: TlsMode,
  customCa: string | undefined,
  allowInsecureTls: boolean,
): Agent | undefined {
  if (tlsMode === "verify") {
    return undefined;
  }

  if (tlsMode === "insecure") {
    if (!allowInsecureTls) {
      throw new HttpRequestError(
        "Insecure TLS is disabled. Set ALLOW_INSECURE_TLS=true to permit per-integration insecure mode.",
      );
    }
    return new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    });
  }

  // custom-ca
  if (!customCa || customCa.trim().length === 0) {
    throw new HttpRequestError("Custom CA certificate is required for custom-ca TLS mode");
  }

  return new Agent({
    connect: {
      ca: customCa,
      rejectUnauthorized: true,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryable(status: number | undefined, error: unknown): boolean {
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return (
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      error.name === "TimeoutError" ||
      error.message.toLowerCase().includes("timeout")
    );
  }
  return false;
}

/**
 * SSRF-safe HTTP GET/POST helper with timeout, limited retries, and TLS modes.
 * Never logs Authorization headers or URL credentials.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const url = await assertSafeOutboundUrl(rawUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const tlsMode = options.tlsMode ?? "verify";
  const allowInsecureTls = options.allowInsecureTls ?? false;
  const fetchImpl: FetchLike =
    options.fetchImpl ?? (undiciFetch as unknown as FetchLike);

  let dispatcher: Agent | undefined;
  try {
    dispatcher = createDispatcher(tlsMode, options.customCa, allowInsecureTls);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw error;
    }
    throw new HttpRequestError("Failed to configure TLS", undefined, {
      cause: error,
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url.toString(), {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
        dispatcher,
      });

      if (!response.ok && isRetryable(response.status, undefined) && attempt < maxRetries) {
        lastError = new HttpRequestError(
          `Upstream returned ${response.status}`,
          response.status,
        );
        await sleep(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");

      if (aborted) {
        throw new HttpRequestError(
          `Request timed out after ${timeoutMs}ms`,
          undefined,
          { cause: error },
        );
      }

      if (isRetryable(undefined, error) && attempt < maxRetries) {
        await sleep(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      const message =
        error instanceof Error ? error.message : "Network request failed";
      // Never include the raw URL (may have been mutated) with credentials —
      // we already rejected credentials, but still redact for safety.
      throw new HttpRequestError(
        `Request to ${redactUrl(url.toString())} failed: ${message}`,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new HttpRequestError("Request failed after retries", undefined, {
    cause: lastError,
  });
}
