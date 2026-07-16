import { randomBytes } from "node:crypto";
import type { FastifyReply } from "fastify";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  safeEqual,
  SESSION_COOKIE_NAME,
  type ServerConfig,
} from "../config/env.js";
import type { ActiveSession } from "../services/sessions.js";

export function createAnonymousCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setAnonymousCsrfCookie(
  reply: FastifyReply,
  config: ServerConfig,
  token: string,
): void {
  reply.setCookie(CSRF_COOKIE_NAME, token, {
    path: "/",
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: 60 * 60,
  });
}

export function setSessionCookie(
  reply: FastifyReply,
  config: ServerConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    expires: expiresAt,
  });
}

export function clearSessionCookie(
  reply: FastifyReply,
  config: ServerConfig,
): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: "/",
    secure: config.cookieSecure,
    sameSite: "lax",
  });
}

export function validateMutationCsrf(
  session: ActiveSession | null,
  anonymousCsrfCookie: string | undefined,
  csrfHeader: string | undefined,
): boolean {
  if (session) {
    return safeEqual(session.csrfToken, csrfHeader ?? "");
  }

  return safeEqual(anonymousCsrfCookie ?? "", csrfHeader ?? "");
}

export { CSRF_HEADER_NAME };
