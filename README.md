# Rackora

Self-hosted homelab monitoring dashboard.

Monorepo with React/Vite frontend, Fastify API, and a TypeScript agent CLI.

## Requirements

- Node.js 22+
- [pnpm](https://pnpm.io/) 11+

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

| Service | URL |
|---|---|
| Web (Vite) | http://localhost:5173 |
| API (Fastify) | http://localhost:7575 (`GET /health`) |

The Vite dev server listens on `0.0.0.0:5173`, so you can open the frontend from another device on your LAN at `http://<server-ip>:5173`. API requests from the dev server are proxied to `http://127.0.0.1:7575`.

Override the API port with the `PORT` environment variable (default `7575`).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in watch mode |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run Vitest suites |
| `pnpm build` | Build shared packages and apps |

## Workspace layout

```text
apps/web       React + Vite + Tailwind landing page
apps/server    Fastify API (serves built web in production)
apps/agent     TypeScript CLI (version + status)
packages/shared   Shared Zod schemas and types
packages/config   Shared tsconfig / ESLint config
```
