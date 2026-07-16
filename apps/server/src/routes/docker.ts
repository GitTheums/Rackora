import type { FastifyInstance } from "fastify";
import {
  dockerAgentListResponseSchema,
  dockerContainerDetailResponseSchema,
  dockerContainerListResponseSchema,
  dockerFleetSummarySchema,
  hostDetailResponseSchema,
  hostListResponseSchema,
} from "@rackora/shared";
import { requireAuth } from "../plugins/rackora.js";
import {
  getDockerContainer,
  getDockerSummary,
  getHost,
  listDockerAgents,
  listDockerContainers,
  listHosts,
} from "../services/docker.js";

export async function registerDockerRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/docker/summary",
    { preHandler: [requireAuth] },
    async () => {
      const summary = await getDockerSummary(app.rackora.db);
      return dockerFleetSummarySchema.parse(summary);
    },
  );

  app.get(
    "/api/docker/agents",
    { preHandler: [requireAuth] },
    async () => {
      const result = await listDockerAgents(app.rackora.db);
      return dockerAgentListResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/docker/containers",
    { preHandler: [requireAuth] },
    async () => {
      const result = await listDockerContainers(app.rackora.db);
      return dockerContainerListResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/docker/containers/:agentId/:containerId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { agentId, containerId } = request.params as {
        agentId: string;
        containerId: string;
      };
      const result = await getDockerContainer(
        app.rackora.db,
        agentId,
        containerId,
      );
      if (!result) {
        return reply.code(404).send({ error: "Container not found" });
      }
      return dockerContainerDetailResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/hosts",
    { preHandler: [requireAuth] },
    async () => {
      const result = await listHosts(app.rackora.db);
      return hostListResponseSchema.parse(result);
    },
  );

  app.get(
    "/api/hosts/:agentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { agentId } = request.params as { agentId: string };
      const result = await getHost(app.rackora.db, agentId);
      if (!result) {
        return reply.code(404).send({ error: "Host not found" });
      }
      return hostDetailResponseSchema.parse(result);
    },
  );
}
