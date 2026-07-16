import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  type ServerConfig,
} from "../config/env.js";
import type { RackoraDatabase } from "../db/client.js";
import type { EncryptionService } from "../services/encryption.js";
import { getSessionByToken } from "../services/sessions.js";
import type { ActiveSession } from "../services/sessions.js";

export type AppContext = {
  db: RackoraDatabase;
  config: ServerConfig;
  encryption: EncryptionService;
};

declare module "fastify" {
  interface FastifyInstance {
    rackora: AppContext;
  }

  interface FastifyRequest {
    session: ActiveSession | null;
  }
}

async function rackoraPlugin(app: FastifyInstance, context: AppContext) {
  app.decorate("rackora", context);

  app.decorateRequest("session", null);

  app.addHook("preHandler", async (request) => {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    request.session = await getSessionByToken(context.db, sessionToken);
  });
}

export default fp(rackoraPlugin, {
  name: "rackora-context",
});

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.session) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const csrfHeader = request.headers[CSRF_HEADER_NAME];
  const headerValue = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  const anonymousCsrf = request.cookies[CSRF_COOKIE_NAME];

  if (request.session) {
    if (!headerValue || headerValue !== request.session.csrfToken) {
      return reply.code(403).send({ error: "Invalid CSRF token" });
    }
    return;
  }

  if (!headerValue || !anonymousCsrf || headerValue !== anonymousCsrf) {
    return reply.code(403).send({ error: "Invalid CSRF token" });
  }
}
