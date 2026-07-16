import type { FastifyInstance } from "fastify";
import {
  authMeResponseSchema,
  csrfResponseSchema,
  loginRequestSchema,
  userResponseSchema,
} from "@rackora/shared";
import { SESSION_COOKIE_NAME } from "../config/env.js";
import { verifyPassword } from "../services/password.js";
import {
  createAnonymousCsrfToken,
  clearSessionCookie,
  setAnonymousCsrfCookie,
  setSessionCookie,
} from "../services/csrf.js";
import {
  createSession,
  deleteSession,
} from "../services/sessions.js";
import { findUserByUsername } from "../services/users.js";
import { requireAuth, requireCsrf } from "../plugins/rackora.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/csrf", async (request, reply) => {
    if (request.session) {
      return csrfResponseSchema.parse({
        csrfToken: request.session.csrfToken,
      });
    }

    const csrfToken = createAnonymousCsrfToken();
    setAnonymousCsrfCookie(reply, app.rackora.config, csrfToken);

    return csrfResponseSchema.parse({ csrfToken });
  });

  app.post(
    "/api/auth/login",
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
      const body = loginRequestSchema.parse(request.body);
      const user = await findUserByUsername(app.rackora.db, body.username);

      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "Invalid username or password" });
      }

      const session = await createSession(
        app.rackora.db,
        app.rackora.config,
        user.id,
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

  app.post(
    "/api/auth/logout",
    {
      preHandler: [requireAuth, requireCsrf],
    },
    async (request, reply) => {
      const sessionToken = request.cookies[SESSION_COOKIE_NAME];
      await deleteSession(app.rackora.db, sessionToken);
      clearSessionCookie(reply, app.rackora.config);

      return { success: true };
    },
  );

  app.get(
    "/api/auth/me",
    {
      preHandler: [requireAuth],
    },
    async (request) => {
      return authMeResponseSchema.parse({
        user: request.session!.user,
        csrfToken: request.session!.csrfToken,
      });
    },
  );
}
