import Fastify, { type FastifyServerOptions } from "fastify";
export declare function createApp(options?: FastifyServerOptions): Fastify.FastifyInstance<Fastify.RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault> & PromiseLike<Fastify.FastifyInstance<Fastify.RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>> & {
    __linterBrands: "SafePromiseLike";
};
export declare function registerProductionStatic(app: ReturnType<typeof createApp>): Promise<boolean>;
//# sourceMappingURL=index.d.ts.map