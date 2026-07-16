import type { FastifyServerOptions } from "fastify";

export function createLoggerOptions(
  logLevel: string,
): FastifyServerOptions["logger"] {
  return {
    level: logLevel,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.token",
        "req.body.csrfToken",
        "req.body.secret",
        "req.body.masterEncryptionKey",
      ],
      censor: "[REDACTED]",
    },
  };
}
