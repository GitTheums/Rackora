import type { FastifyInstance } from "fastify";
import { infrastructureSchema } from "@rackora/shared";
import { requireAuth } from "../plugins/rackora.js";
import { getLatestInfrastructure } from "../services/integrations.js";

export async function registerInfrastructureRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/infrastructure",
    { preHandler: [requireAuth] },
    async () => {
      const data = await getLatestInfrastructure(app.rackora.db);
      return infrastructureSchema.parse(data);
    },
  );
}
