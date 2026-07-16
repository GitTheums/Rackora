import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, {} from "fastify";
import fastifyStatic from "@fastify/static";
import { RACKORA_VERSION, } from "@rackora/shared";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function createApp(options = {}) {
    const app = Fastify({
        logger: false,
        ...options,
    });
    app.get("/health", async () => {
        return {
            status: "ok",
            service: "rackora-server",
            version: RACKORA_VERSION,
            timestamp: new Date().toISOString(),
        };
    });
    return app;
}
export async function registerProductionStatic(app) {
    const webDist = path.resolve(__dirname, "../../web/dist");
    if (!existsSync(webDist)) {
        app.log.warn({ webDist }, "Web dist not found; skipping static frontend serving");
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
    const isProduction = process.env.NODE_ENV === "production";
    const app = createApp({
        logger: true,
    });
    const port = Number(process.env.PORT ?? 7575);
    const host = process.env.HOST ?? "0.0.0.0";
    if (isProduction) {
        await registerProductionStatic(app);
    }
    await app.listen({ port, host });
}
const entry = process.argv[1];
if (entry !== undefined &&
    path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map