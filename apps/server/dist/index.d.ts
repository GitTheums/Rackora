import type { Client } from "@libsql/client";
import { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { type ServerConfig } from "./config/env.js";
import { type RackoraDatabase } from "./db/client.js";
import { type AppContext } from "./plugins/rackora.js";
import { EncryptionService } from "./services/encryption.js";
import { IntegrationScheduler } from "./services/scheduler.js";
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
export declare function createApp(options?: CreateAppOptions): Promise<CreateAppResult>;
export declare function registerProductionStatic(app: FastifyInstance): Promise<boolean>;
//# sourceMappingURL=index.d.ts.map