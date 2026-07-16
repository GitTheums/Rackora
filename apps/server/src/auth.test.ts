import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CSRF_HEADER_NAME, hashToken, SESSION_COOKIE_NAME } from "./config/env.js";
import { sessions, users } from "./db/schema.js";
import { hashPassword } from "./services/password.js";
import {
  cookieHeader,
  createTestApp,
  extractCookie,
  TEST_MASTER_KEY,
} from "./test/helpers.js";

describe("auth and setup", () => {
  it("completes setup, login and logout", async () => {
    const { app, cleanup } = await createTestApp();

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/setup/status",
    });
    expect(statusResponse.statusCode).toBe(200);
    const statusBody = JSON.parse(statusResponse.body) as {
      setupRequired: boolean;
      csrfToken: string;
    };
    expect(statusBody.setupRequired).toBe(true);

    const csrfCookie = extractCookie(
      statusResponse.headers["set-cookie"],
      "rackora_csrf",
    );

    const setupResponse = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: {
        [CSRF_HEADER_NAME]: statusBody.csrfToken,
        cookie: cookieHeader({ rackora_csrf: csrfCookie }),
      },
      payload: {
        username: "admin",
        password: "secure-pass",
      },
    });
    expect(setupResponse.statusCode).toBe(200);

    const sessionCookie = extractCookie(
      setupResponse.headers["set-cookie"],
      SESSION_COOKIE_NAME,
    );
    const setupBody = JSON.parse(setupResponse.body) as {
      user: { username: string };
      csrfToken: string;
    };
    expect(setupBody.user.username).toBe("admin");

    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        [CSRF_HEADER_NAME]: setupBody.csrfToken,
        cookie: cookieHeader({
          [SESSION_COOKIE_NAME]: sessionCookie,
        }),
      },
    });

    const loginCsrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf",
    });
    const loginCsrfBody = JSON.parse(loginCsrfResponse.body) as {
      csrfToken: string;
    };
    const loginCsrfCookie = extractCookie(
      loginCsrfResponse.headers["set-cookie"],
      "rackora_csrf",
    );

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        [CSRF_HEADER_NAME]: loginCsrfBody.csrfToken,
        cookie: cookieHeader({ rackora_csrf: loginCsrfCookie }),
      },
      payload: {
        username: "admin",
        password: "secure-pass",
      },
    });
    expect(loginResponse.statusCode).toBe(200);

    const loginBody = JSON.parse(loginResponse.body) as { csrfToken: string };
    const loginSessionCookie = extractCookie(
      loginResponse.headers["set-cookie"],
      SESSION_COOKIE_NAME,
    );

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        cookie: cookieHeader({
          [SESSION_COOKIE_NAME]: loginSessionCookie,
        }),
      },
    });
    expect(meResponse.statusCode).toBe(200);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        [CSRF_HEADER_NAME]: loginBody.csrfToken,
        cookie: cookieHeader({
          [SESSION_COOKIE_NAME]: loginSessionCookie,
        }),
      },
    });
    expect(logoutResponse.statusCode).toBe(200);

    await app.close();
    cleanup();
  });

  it("rejects a second setup attempt", async () => {
    const { app, cleanup } = await createTestApp();

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/setup/status",
    });
    const statusBody = JSON.parse(statusResponse.body) as {
      csrfToken: string;
    };
    const csrfCookie = extractCookie(
      statusResponse.headers["set-cookie"],
      "rackora_csrf",
    );

    await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: {
        [CSRF_HEADER_NAME]: statusBody.csrfToken,
        cookie: cookieHeader({ rackora_csrf: csrfCookie }),
      },
      payload: {
        username: "admin",
        password: "secure-pass",
      },
    });

    const secondCsrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf",
    });
    const secondCsrfBody = JSON.parse(secondCsrfResponse.body) as {
      csrfToken: string;
    };
    const secondCsrfCookie = extractCookie(
      secondCsrfResponse.headers["set-cookie"],
      "rackora_csrf",
    );

    const secondSetup = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: {
        [CSRF_HEADER_NAME]: secondCsrfBody.csrfToken,
        cookie: cookieHeader({ rackora_csrf: secondCsrfCookie }),
      },
      payload: {
        username: "other",
        password: "secure-pass",
      },
    });

    expect(secondSetup.statusCode).toBe(403);

    await app.close();
    cleanup();
  });

  it("rejects login with a wrong password", async () => {
    const { app, db, cleanup } = await createTestApp();
    const now = new Date();
    const userId = randomUUID();

    await db.insert(users).values({
      id: userId,
      username: "admin",
      passwordHash: await hashPassword("correct-pass"),
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });

    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf",
    });
    const csrfBody = JSON.parse(csrfResponse.body) as { csrfToken: string };
    const csrfCookie = extractCookie(
      csrfResponse.headers["set-cookie"],
      "rackora_csrf",
    );

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: {
        [CSRF_HEADER_NAME]: csrfBody.csrfToken,
        cookie: cookieHeader({ rackora_csrf: csrfCookie }),
      },
      payload: {
        username: "admin",
        password: "wrong-pass",
      },
    });

    expect(loginResponse.statusCode).toBe(401);

    await app.close();
    cleanup();
  });

  it("rejects expired sessions", async () => {
    const { app, db, cleanup } = await createTestApp();
    const now = new Date();
    const userId = randomUUID();
    const sessionToken = "test-session-token";
    const csrfToken = "test-csrf-token";

    await db.insert(users).values({
      id: userId,
      username: "admin",
      passwordHash: await hashPassword("secure-pass"),
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(sessions).values({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(sessionToken),
      csrfToken,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: now,
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        cookie: cookieHeader({
          [SESSION_COOKIE_NAME]: sessionToken,
        }),
      },
    });

    expect(meResponse.statusCode).toBe(401);

    await app.close();
    cleanup();
  });
});

describe("startup configuration", () => {
  it("fails fast when MASTER_ENCRYPTION_KEY is missing", async () => {
    const { parseMasterEncryptionKey } = await import("./config/env.js");
    expect(() => parseMasterEncryptionKey(undefined)).toThrow(
      /MASTER_ENCRYPTION_KEY is required/,
    );
  });

  it("fails fast when MASTER_ENCRYPTION_KEY is invalid", async () => {
    const { parseMasterEncryptionKey } = await import("./config/env.js");
    expect(() => parseMasterEncryptionKey("too-short")).toThrow(
      /MASTER_ENCRYPTION_KEY is invalid/,
    );
  });
});

describe("encryption", () => {
  it("roundtrips encrypted secrets", async () => {
    const { app, db, encryption, cleanup } = await createTestApp();
    const { storeSecret, readSecret } = await import("./services/secrets.js");

    await storeSecret(db, encryption, "integration.token", "secret-value");
    const value = await readSecret(db, encryption, "integration.token");

    expect(value).toBe("secret-value");

    await app.close();
    cleanup();
  });

  it("fails decryption with the wrong master key", async () => {
    const { app, db, encryption, cleanup } = await createTestApp();
    const { storeSecret, readSecret } = await import("./services/secrets.js");
    const wrongKey = Buffer.from(TEST_MASTER_KEY, "hex");
    wrongKey[0] = wrongKey[0]! ^ 0xff;
    const wrongEncryption = (
      await import("./services/encryption.js")
    ).EncryptionService;

    await storeSecret(db, encryption, "integration.token", "secret-value");

    const badService = new wrongEncryption(wrongKey);
    await expect(
      readSecret(db, badService, "integration.token"),
    ).rejects.toThrow();

    await app.close();
    cleanup();
  });
});
