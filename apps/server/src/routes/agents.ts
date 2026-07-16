import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  AGENT_ID_HEADER,
  AGENT_NONCE_HEADER,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
  agentDetailResponseSchema,
  agentHeartbeatRequestSchema,
  agentHeartbeatResponseSchema,
  agentListResponseSchema,
  agentResponseSchema,
  agentTelemetryStateResponseSchema,
  createEnrollmentTokenRequestSchema,
  enrollAgentRequestSchema,
  enrollAgentResponseSchema,
  enrollmentTokenListResponseSchema,
  enrollmentTokenResponseSchema,
} from "@rackora/shared";
import { requireAuth, requireCsrf } from "../plugins/rackora.js";
import {
  getAgentTelemetryState,
  listAgentMetricSamples,
} from "../services/agent-telemetry.js";
import {
  AgentServiceError,
  authenticateAgentRequest,
  createEnrollmentToken,
  enrollAgent,
  getAgent,
  listAgents,
  listEnrollmentTokens,
  recordHeartbeat,
  revokeAgent,
} from "../services/agents.js";

function zodErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

function headerValue(
  headers: FastifyRequest["headers"],
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function getRawBody(request: FastifyRequest): string {
  const raw = (request as FastifyRequest & { rawBody?: string }).rawBody;
  if (typeof raw === "string") {
    return raw;
  }
  if (request.body === undefined || request.body === null) {
    return "";
  }
  return JSON.stringify(request.body);
}

export async function registerAgentRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/api/agents/enrollment-tokens",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      try {
        const body = createEnrollmentTokenRequestSchema.parse(request.body);
        const token = await createEnrollmentToken(app.rackora.db, body);
        return reply
          .code(201)
          .send(enrollmentTokenResponseSchema.parse(token));
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        if (error instanceof AgentServiceError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/agents/enrollment-tokens",
    { preHandler: [requireAuth] },
    async (request) => {
      const query = request.query as { status?: string };
      const pendingOnly = query.status === "pending";
      const result = await listEnrollmentTokens(app.rackora.db, {
        pendingOnly,
      });
      return enrollmentTokenListResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/agents",
    { preHandler: [requireAuth] },
    async () => {
      const result = await listAgents(app.rackora.db);
      return agentListResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/agents/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      // Avoid colliding with static segments if routing order changes.
      if (id === "enrollment-tokens" || id === "enroll" || id === "heartbeat") {
        return reply.code(404).send({ error: "Not found" });
      }
      const agent = await getAgent(app.rackora.db, id);
      if (!agent) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      return agentDetailResponseSchema.parse({ agent });
    },
  );

  app.post(
    "/api/agents/:id/revoke",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const agent = await revokeAgent(app.rackora.db, id);
      if (!agent) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      return agentResponseSchema.parse(agent);
    },
  );

  app.get(
    "/api/agents/:id/telemetry",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const state = await getAgentTelemetryState(app.rackora.db, id);
      if (!state) {
        return reply.code(404).send({ error: "Telemetry not found" });
      }
      return agentTelemetryStateResponseSchema.parse(state);
    },
  );

  app.get(
    "/api/agents/:id/metrics",
    { preHandler: [requireAuth] },
    async (request) => {
      const { id } = request.params as { id: string };
      const samples = await listAgentMetricSamples(app.rackora.db, id);
      return { samples };
    },
  );

  app.post(
    "/api/agents/enroll",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      try {
        const body = enrollAgentRequestSchema.parse(request.body);
        const result = await enrollAgent(
          app.rackora.db,
          app.rackora.encryption,
          body,
        );
        return reply.code(201).send(enrollAgentResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        if (error instanceof AgentServiceError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/agents/heartbeat",
    {
      config: {
        rateLimit: { max: 120, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      try {
        const rawBody = getRawBody(request);
        const auth = await authenticateAgentRequest(
          app.rackora.db,
          app.rackora.encryption,
          {
            agentId: headerValue(request.headers, AGENT_ID_HEADER),
            timestamp: headerValue(request.headers, AGENT_TIMESTAMP_HEADER),
            nonce: headerValue(request.headers, AGENT_NONCE_HEADER),
            signature: headerValue(request.headers, AGENT_SIGNATURE_HEADER),
          },
          rawBody,
        );

        if (!auth.ok) {
          return reply.code(auth.status).send({ error: auth.error });
        }

        const body = agentHeartbeatRequestSchema.parse(request.body ?? {});
        const result = await recordHeartbeat(
          app.rackora.db,
          auth.agent.id,
          body,
        );

        return agentHeartbeatResponseSchema.parse({
          ok: true as const,
          receivedAt: result.receivedAt,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        throw error;
      }
    },
  );
}
