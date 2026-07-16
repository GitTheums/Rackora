import type { FastifyInstance } from "fastify";
import { dashboardOverviewSchema } from "@rackora/shared";
import { requireAuth } from "../plugins/rackora.js";
import { getDashboardOverview } from "../services/proxmox-overview.js";

export async function registerOverviewRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/overview",
    { preHandler: [requireAuth] },
    async () => {
      const overview = await getDashboardOverview(app.rackora.db);
      return dashboardOverviewSchema.parse(overview);
    },
  );
}
