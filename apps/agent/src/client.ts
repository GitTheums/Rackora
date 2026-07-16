import {
  enrollAgentResponseSchema,
  agentHeartbeatResponseSchema,
  type AgentTelemetry,
  type EnrollAgentResponse,
} from "@rackora/shared";
import { buildSignedHeaders } from "./auth.js";

export type AgentHttpClient = {
  enroll: (options: {
    coreUrl: string;
    token: string;
    name: string;
  }) => Promise<EnrollAgentResponse>;
  heartbeat: (options: {
    coreUrl: string;
    agentId: string;
    secret: string;
    status?: "ok" | "degraded" | "error";
    telemetry?: AgentTelemetry;
  }) => Promise<{ ok: true; receivedAt: string }>;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export function createAgentHttpClient(
  fetchImpl: typeof fetch = fetch,
): AgentHttpClient {
  return {
    async enroll({ coreUrl, token, name }) {
      const response = await fetchImpl(joinUrl(coreUrl, "/api/agents/enroll"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ token, name }),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Enrollment failed (${response.status}): ${safeErrorBody(text)}`,
        );
      }

      return enrollAgentResponseSchema.parse(JSON.parse(text) as unknown);
    },

    async heartbeat({ coreUrl, agentId, secret, status = "ok", telemetry }) {
      const bodyObject = telemetry ? { status, telemetry } : { status };
      const rawBody = JSON.stringify(bodyObject);
      const signed = buildSignedHeaders({ agentId, secret, rawBody });

      const response = await fetchImpl(
        joinUrl(coreUrl, "/api/agents/heartbeat"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...signed.headers,
          },
          body: rawBody,
        },
      );

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `Heartbeat failed (${response.status}): ${safeErrorBody(text)}`,
        );
      }

      return agentHeartbeatResponseSchema.parse(JSON.parse(text) as unknown);
    },
  };
}

function safeErrorBody(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // ignore
  }
  return "request failed";
}
