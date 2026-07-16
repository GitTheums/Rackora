import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  setupRequestSchema,
  setupStatusResponseSchema,
  userResponseSchema,
} from "@rackora/shared";
import { CSRF_COOKIE_NAME } from "../config/env.js";
import { hashPassword } from "../services/password.js";
import {
  createAnonymousCsrfToken,
  setAnonymousCsrfCookie,
  setSessionCookie,
} from "../services/csrf.js";
import { createSession } from "../services/sessions.js";
import { hasAdminUser } from "../services/users.js";
import { users } from "../db/schema.js";
import { requireCsrf } from "../plugins/rackora.js";

export async function registerSetupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/setup/status", async (request, reply) => {
    const setupRequired = !(await hasAdminUser(app.rackora.db));
    let csrfToken = request.cookies[CSRF_COOKIE_NAME];

    if (!csrfToken) {
      csrfToken = createAnonymousCsrfToken();
      setAnonymousCsrfCookie(reply, app.rackora.config, csrfToken);
    }

    const payload = setupStatusResponseSchema.parse({
      setupRequired,
      csrfToken,
    });

    return payload;
  });

  app.post(
    "/api/setup",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
      preHandler: [requireCsrf],
    },
    async (request, reply) => {
      if (await hasAdminUser(app.rackora.db)) {
        return reply.code(403).send({ error: "Setup already completed" });
      }

      const body = setupRequestSchema.parse(request.body);
      const now = new Date();
      const passwordHash = await hashPassword(body.password);
      const userId = randomUUID();

      await app.rackora.db.insert(users).values({
        id: userId,
        username: body.username,
        passwordHash,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      });

      const session = await createSession(
        app.rackora.db,
        app.rackora.config,
        userId,
      );
      setSessionCookie(
        reply,
        app.rackora.config,
        session.token,
        session.expiresAt,
      );

      return userResponseSchema.parse({
        user: session.user,
        csrfToken: session.csrfToken,
      });
    },
  );
}
