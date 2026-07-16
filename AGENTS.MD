# Rackora projectregels

Rackora is een self-hosted homelab monitoringdashboard.

Architectuur:
- React + Vite + TypeScript frontend
- Fastify + TypeScript backend
- SQLite + Drizzle ORM
- TypeScript Rackora Agent
- Core ontvangt outbound agent telemetry
- Proxmox is read-only
- Geen start/stop/update/execute-acties in het MVP

Werkwijze:
1. Lees eerst de relevante GitHub Issue.
2. Maak een klein plan.
3. Wijzig alleen benodigde bestanden.
4. Valideer externe input met Zod.
5. Schrijf tests.
6. Voer lint, typecheck, test en build uit.
7. Meld wat nog niet getest is.

Security:
- Log nooit secrets, tokens, cookies of container environmentvariabelen.
- Gebruik geen generieke remote command execution.
- De Docker socket mag alleen via de kleine agent worden gelezen.
- Alle integratiesecrets worden versleuteld opgeslagen.
