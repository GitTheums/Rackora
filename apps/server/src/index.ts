import type { Client } from "@libsql/client";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type HealthResponse,
  RACKORA_VERSION,
} from "@rackora/shared";
import { loadConfig, type ServerConfig } from "./config/env.js";
import { loadEnvironment } from "./config/load-env.js";
import { createLoggerOptions } from "./config/logger.js";
import { openDatabase, type RackoraDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import rackoraPlugin, { type AppContext } from "./plugins/rackora.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDockerRoutes } from "./routes/docker.js";
import { registerInfrastructureRoutes } from "./routes/infrastructure.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerOverviewRoutes } from "./routes/overview.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { EncryptionService } from "./services/encryption.js";
import { IntegrationScheduler } from "./services/scheduler.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type CreateAppOptions = {
  logger?: FastifyServerOptions["logger"] | false;
  deps?: AppContext;
  skipMigrations?: boolean;
  serveStatic?: boolean;
  /** Start the integration poll scheduler (default: true outside tests). */
  enableScheduler?: boolean;
};

export type CreateAppResult = {
  app: FastifyInstance;
  db: RackoraDatabase;
  client: Client | null;
  closeDatabase: () => void;
  config: ServerConfig;
  encryption: EncryptionService;
  scheduler: IntegrationScheduler | null;
};

export async function createApp(
  options: CreateAppOptions = {},
): Promise<CreateAppResult> {
  const config = options.deps?.config ?? loadConfig();
  const opened = options.deps?.db
    ? {
        db: options.deps.db,
        client: null as Client | null,
        closeDatabase: () => undefined,
      }
    : await openDatabase(config.databasePath).then((result) => ({
        db: result.db,
        client: result.client,
        closeDatabase: result.close,
      }));

  const encryption =
    options.deps?.encryption ??
    new EncryptionService(config.masterEncryptionKey);

  if (!options.skipMigrations) {
    await runMigrations(opened.db);
  }

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : (options.logger ?? createLoggerOptions(config.logLevel)),
    trustProxy: config.appUrl.startsWith("https://"),
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const raw = typeof body === "string" ? body : "";
      request.rawBody = raw;
      if (raw.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(raw) as unknown);
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  await app.register(rackoraPlugin, {
    db: opened.db,
    config,
    encryption,
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      service: "rackora-server",
      version: RACKORA_VERSION,
      timestamp: new Date().toISOString(),
    };
  });

  await registerSetupRoutes(app);
  await registerAuthRoutes(app);
  await registerAgentRoutes(app);
  await registerDockerRoutes(app);
  await registerIntegrationRoutes(app);
  await registerInfrastructureRoutes(app);
  await registerOverviewRoutes(app);

  if (options.serveStatic) {
    await registerProductionStatic(app);
  }

  const enableScheduler =
    options.enableScheduler ?? config.nodeEnv !== "test";

  let scheduler: IntegrationScheduler | null = null;
  if (enableScheduler) {
    scheduler = new IntegrationScheduler({
      db: opened.db,
      encryption,
      allowInsecureTls: config.allowInsecureTls,
      logger: app.log,
    });
    scheduler.start();
    app.addHook("onClose", async () => {
      scheduler?.stop();
    });
  }

  return {
    app,
    db: opened.db,
    client: opened.client,
    closeDatabase: opened.closeDatabase,
    config,
    encryption,
    scheduler,
  };
}

export async function registerProductionStatic(
  app: FastifyInstance,
): Promise<boolean> {
  const webDist = path.resolve(__dirname, "../../web/dist");

  if (!existsSync(webDist)) {
    app.log.warn(
      { webDist },
      "Web dist not found; skipping static frontend serving",
    );
    return false;
  }

  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.sendFile("index.html");
  });

  return true;
}

async function main() {
  loadEnvironment();

  let config: ServerConfig;

  try {
    config = loadConfig();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid server configuration",
    );
    process.exit(1);
  }

  const isProduction = config.nodeEnv === "production";
  const { app, closeDatabase } = await createApp({
    serveStatic: isProduction,
  });

  const shutdown = async () => {
    await app.close();
    closeDatabase();
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await app.listen({ port: config.port, host: config.host });
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
