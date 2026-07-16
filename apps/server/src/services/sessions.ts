import { randomBytes, randomUUID } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { ServerConfig } from "../config/env.js";
import { hashToken, safeEqual } from "../config/env.js";
import type { RackoraDatabase } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export type SessionUser = {
  id: string;
  username: string;
  role: string;
};

export type ActiveSession = {
  id: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
  user: SessionUser;
};

function createToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  db: RackoraDatabase,
  config: ServerConfig,
  userId: string,
): Promise<ActiveSession> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  const token = createToken();
  const csrfToken = createToken();

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("User not found for session creation.");
  }

  await db.insert(sessions).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashToken(token),
    csrfToken,
    expiresAt,
    createdAt: now,
  });

  return {
    id: user.id,
    token,
    csrfToken,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  };
}

export async function getSessionByToken(
  db: RackoraDatabase,
  token: string | undefined,
): Promise<ActiveSession | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
    with: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return {
    id: session.id,
    token,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
    },
  };
}

export async function deleteSession(
  db: RackoraDatabase,
  token: string | undefined,
): Promise<void> {
  if (!token) {
    return;
  }

  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function purgeExpiredSessions(db: RackoraDatabase): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function validateCsrfToken(
  expected: string | undefined,
  provided: string | undefined,
): boolean {
  if (!expected || !provided) {
    return false;
  }

  return safeEqual(expected, provided);
}
