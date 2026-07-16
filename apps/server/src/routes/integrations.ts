import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import {
  connectionTestResultSchema,
  createProxmoxIntegrationSchema,
  integrationListResponseSchema,
  integrationResponseSchema,
  testProxmoxConnectionSchema,
  updateProxmoxIntegrationSchema,
} from "@rackora/shared";
import { ProxmoxAdapter } from "../integrations/proxmox/adapter.js";
import { requireAuth, requireCsrf } from "../plugins/rackora.js";
import {
  createProxmoxIntegration,
  deleteIntegration,
  getIntegration,
  listIntegrations,
  loadProxmoxConfig,
  pollProxmoxIntegration,
  updateProxmoxIntegration,
} from "../services/integrations.js";

function zodErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export async function registerIntegrationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const allowInsecureTls = app.rackora.config.allowInsecureTls;

  app.get(
    "/api/integrations",
    { preHandler: [requireAuth] },
    async () => {
      const integrations = await listIntegrations(app.rackora.db);
      return integrationListResponseSchema.parse({ integrations });
    },
  );

  app.get(
    "/api/integrations/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const integration = await getIntegration(app.rackora.db, id);
      if (!integration) {
        return reply.code(404).send({ error: "Integration not found" });
      }
      return integrationResponseSchema.parse({ integration });
    },
  );

  app.post(
    "/api/integrations/proxmox/test",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      try {
        const body = testProxmoxConnectionSchema.parse(request.body);
        const adapter = new ProxmoxAdapter({ allowInsecureTls });
        const result = await adapter.testConnection(body);
        return connectionTestResultSchema.parse(result);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/integrations/proxmox",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      try {
        const body = createProxmoxIntegrationSchema.parse(request.body);
        const adapter = new ProxmoxAdapter({ allowInsecureTls });

        // Validate connectivity before persisting secrets.
        const test = await adapter.testConnection(body.config);
        if (!test.ok) {
          return reply.code(400).send({ error: test.message });
        }

        const integration = await createProxmoxIntegration(
          app.rackora.db,
          app.rackora.encryption,
          body,
        );

        // Kick an initial poll (non-blocking).
        void pollProxmoxIntegration(
          app.rackora.db,
          app.rackora.encryption,
          allowInsecureTls,
          integration.id,
        );

        return reply
          .code(201)
          .send(integrationResponseSchema.parse({ integration }));
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        throw error;
      }
    },
  );

  app.patch(
    "/api/integrations/:id",
    {
      preHandler: [requireAuth, requireCsrf],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = updateProxmoxIntegrationSchema.parse(request.body);
        const integration = await updateProxmoxIntegration(
          app.rackora.db,
          app.rackora.encryption,
          id,
          body,
        );
        if (!integration) {
          return reply.code(404).send({ error: "Integration not found" });
        }
        return integrationResponseSchema.parse({ integration });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({ error: zodErrorMessage(error) });
        }
        throw error;
      }
    },
  );

  app.delete(
    "/api/integrations/:id",
    {
      preHandler: [requireAuth, requireCsrf],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await deleteIntegration(app.rackora.db, id);
      if (!deleted) {
        return reply.code(404).send({ error: "Integration not found" });
      }
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/integrations/:id/test",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const loaded = await loadProxmoxConfig(
        app.rackora.db,
        app.rackora.encryption,
        id,
      );
      if (!loaded) {
        return reply.code(404).send({ error: "Integration not found" });
      }

      const adapter = new ProxmoxAdapter({ allowInsecureTls });
      const result = await adapter.testConnection(loaded.config);
      return connectionTestResultSchema.parse(result);
    },
  );

  app.post(
    "/api/integrations/:id/poll",
    {
      preHandler: [requireAuth, requireCsrf],
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await getIntegration(app.rackora.db, id);
      if (!existing) {
        return reply.code(404).send({ error: "Integration not found" });
      }

      const result = await pollProxmoxIntegration(
        app.rackora.db,
        app.rackora.encryption,
        allowInsecureTls,
        id,
      );

      if (!result.ok) {
        return reply.code(502).send({ error: result.message });
      }

      const integration = await getIntegration(app.rackora.db, id);
      return integrationResponseSchema.parse({ integration });
    },
  );
}
