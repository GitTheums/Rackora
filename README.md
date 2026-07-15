# Rackora
<p align="center">
  <img src="https://imgur.com/a/dY5Dng3" alt="alternatetext"> 
</p>


<p align="center">
  <strong>Your homelab, at a glance.</strong>
</p>

<p align="center">
  A modern, self-hosted dashboard for monitoring Proxmox, Docker, storage, temperatures, network availability, updates and power usage from one interface.
</p>

<p align="center">
  <img alt="GitHub License" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white">
  <img alt="Proxmox" src="https://img.shields.io/badge/Proxmox-supported-E57000?logo=proxmox&logoColor=white">
  <img alt="Status" src="https://img.shields.io/badge/status-in%20development-yellow">
</p>

> [!IMPORTANT]
> Rackora is currently under active development. Interfaces, configuration options and installation instructions may change before the first stable release.

---

## About Rackora

Rackora brings the most important information from your homelab together in one clean dashboard.

Instead of switching between Proxmox, Docker, monitoring tools, update managers and smart-plug apps, Rackora gives you a single place to see whether your infrastructure is healthy.

Rackora is designed for:

- Proxmox users
- Docker and Docker Compose users
- Home server owners
- Self-hosting enthusiasts
- Small homelabs with one or multiple hosts
- Users who want useful monitoring without setting up a large observability stack

---

## Preview

Add screenshots to the `docs/images` folder and replace the example below.

<p align="center">
  <img src="docs/images/dashboard-preview.png" alt="Rackora dashboard preview" width="900">
</p>

---

## Features

### Proxmox monitoring

- View Proxmox nodes
- Monitor CPU and memory usage
- Monitor local and shared storage
- View virtual machines and LXC containers
- Show running, stopped and unavailable guests
- Display uptime and basic node health
- Support multiple Proxmox nodes

### Docker monitoring

- View Docker hosts
- View running and stopped containers
- Monitor container CPU and memory usage
- Display container health status
- Show image names and versions
- Detect available image updates
- Support multiple Docker hosts through Rackora Agent

### Hardware and storage

- CPU temperature
- NVMe and SSD temperature
- Disk usage
- SMART health information
- Host uptime
- Load average
- Memory usage
- Optional power usage through supported smart plugs

### Network monitoring

- Ping checks
- HTTP and HTTPS checks
- Service availability
- Response time
- Internet connectivity status
- Configurable check intervals

### Alerts

- Dashboard notifications
- Discord webhooks
- Telegram notifications
- Offline host alerts
- High temperature alerts
- Storage usage alerts
- Container stopped alerts
- Update notifications

### Dashboard

- Responsive web interface
- Light and dark mode
- Customizable cards
- Status overview
- Recent alerts
- Mobile-friendly layout
- Multiple hosts in one dashboard

---

## Planned integrations

- Proxmox VE
- Docker Engine
- Docker Compose
- Shelly
- Home Assistant
- UniFi
- Pi-hole
- AdGuard Home
- TrueNAS
- Synology DSM
- NUT UPS
- Prometheus exporters

Integrations will be added gradually. See the [roadmap](#roadmap) for the current priorities.

---

## Architecture

Rackora consists of two main components.

### Rackora Server

The central web application contains:

- Web dashboard
- REST API
- Authentication
- Database
- Alert engine
- Integration configuration
- Historical measurements

### Rackora Agent

A lightweight agent runs on Docker or Linux hosts and collects local information.

The agent:

- Reads Docker container information
- Reads host metrics
- Reads temperatures where available
- Sends sanitized data to Rackora Server
- Makes outbound connections only
- Does not expose the Docker socket to the central application

```text
┌──────────────────────┐
│   Rackora Server     │
│                      │
│  Dashboard + API     │
│  Database + Alerts   │
└──────────┬───────────┘
           │ HTTPS
           │
     ┌─────┴─────┐
     │           │
┌────▼─────┐ ┌───▼────────┐
│ Agent 01 │ │  Agent 02  │
│ Docker   │ │  Docker    │
│ Host A   │ │  Host B    │
└──────────┘ └────────────┘
           │
           │ Proxmox API
           ▼
┌──────────────────────┐
│    Proxmox Cluster   │
└──────────────────────┘
```

---

## Technology stack

The initial Rackora implementation uses:

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Recharts

### Backend

- Node.js
- TypeScript
- Fastify
- Prisma
- SQLite for the default installation
- PostgreSQL as a future option

### Agent

- Node.js or Go
- Docker Engine API
- Linux system information
- Secure agent authentication

### Deployment

- Docker
- Docker Compose
- GitHub Actions
- GitHub Container Registry

---

## Quick start

The examples below use a placeholder image name. Replace `<github-username>` with the GitHub account or organization that publishes Rackora.

### Requirements

- Docker Engine 24 or newer
- Docker Compose v2
- At least 1 GB RAM
- Approximately 1 GB free storage
- A supported 64-bit Linux system

### 1. Create a project directory

```bash
mkdir -p /opt/rackora
cd /opt/rackora
```

### 2. Create `compose.yml`

```yaml
services:
  rackora:
    image: ghcr.io/<github-username>/rackora:latest
    container_name: rackora
    restart: unless-stopped
    ports:
      - "3080:3000"
    environment:
      TZ: Europe/Amsterdam
      NODE_ENV: production
      DATABASE_URL: file:/app/data/rackora.db
      APP_URL: http://localhost:3080
      SESSION_SECRET: change-this-to-a-long-random-value
      ENCRYPTION_KEY: change-this-to-a-32-byte-secret
    volumes:
      - rackora_data:/app/data

volumes:
  rackora_data:
```

### 3. Generate secure secrets

```bash
openssl rand -hex 32
```

Generate a separate value for `SESSION_SECRET` and `ENCRYPTION_KEY`.

### 4. Start Rackora

```bash
docker compose up -d
```

### 5. Open the dashboard

Open:

```text
http://YOUR-SERVER-IP:3080
```

Complete the initial setup and create the administrator account.

---

## Rackora Agent

Install Rackora Agent on every Docker host you want to monitor.

### Example agent configuration

```yaml
services:
  rackora-agent:
    image: ghcr.io/<github-username>/rackora-agent:latest
    container_name: rackora-agent
    restart: unless-stopped
    environment:
      RACKORA_SERVER_URL: https://rackora.example.com
      RACKORA_AGENT_TOKEN: replace-with-agent-token
      RACKORA_AGENT_NAME: docker-host-01
      COLLECTION_INTERVAL: 30
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /sys:/host/sys:ro
      - /proc:/host/proc:ro
      - /etc/os-release:/host/etc/os-release:ro
```

Start the agent:

```bash
docker compose up -d
```

> [!WARNING]
> Access to the Docker socket is security-sensitive. Run Rackora Agent only on trusted hosts, mount the socket read-only and never expose the Docker API directly to the internet.

---

## Proxmox configuration

Rackora should use a dedicated read-only Proxmox API token.

### Recommended setup

1. Create a dedicated Proxmox user, for example:

```text
rackora@pve
```

2. Create a role containing only the permissions Rackora needs.
3. Assign the role at the required path.
4. Create an API token for the Rackora user.
5. Add the Proxmox connection inside Rackora.

Required values:

```text
Proxmox URL: https://proxmox.example.local:8006
Token ID: rackora@pve!rackora
Token secret: YOUR_TOKEN_SECRET
TLS verification: enabled
```

Do not use the Proxmox `root@pam` account.

---

## Configuration

Rackora can be configured through environment variables.

| Variable | Required | Default | Description |
|---|---:|---|---|
| `NODE_ENV` | Yes | `production` | Application environment |
| `TZ` | No | `UTC` | Container timezone |
| `DATABASE_URL` | Yes | — | Database connection |
| `APP_URL` | Yes | — | Public Rackora URL |
| `SESSION_SECRET` | Yes | — | Secret used for sessions |
| `ENCRYPTION_KEY` | Yes | — | Key used to encrypt stored credentials |
| `LOG_LEVEL` | No | `info` | Application log level |
| `PORT` | No | `3000` | Internal application port |
| `TRUST_PROXY` | No | `false` | Enable when using a trusted reverse proxy |

Never commit real secrets to GitHub.

---

## Reverse proxy

Rackora can be placed behind Caddy, Traefik, Nginx Proxy Manager or another reverse proxy.

### Caddy example

```caddyfile
rackora.example.com {
    reverse_proxy 127.0.0.1:3080
}
```

### Nginx example

```nginx
server {
    listen 443 ssl http2;
    server_name rackora.example.com;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When using a reverse proxy, set:

```env
APP_URL=https://rackora.example.com
TRUST_PROXY=true
```

---

## Updating Rackora

Pull the newest images:

```bash
cd /opt/rackora
docker compose pull
```

Recreate the containers:

```bash
docker compose up -d
```

Remove unused images:

```bash
docker image prune -f
```

Check the logs:

```bash
docker compose logs --tail=100 rackora
```

---

## Backup

Rackora stores its persistent data in the mounted data directory or Docker volume.

### Stop Rackora

```bash
docker compose stop rackora
```

### Create a backup

For a bind mount:

```bash
tar -czf rackora-backup-$(date +%F).tar.gz /opt/rackora/data
```

For a Docker volume:

```bash
docker run --rm \
  -v rackora_data:/source:ro \
  -v "$PWD":/backup \
  alpine \
  tar -czf /backup/rackora-backup-$(date +%F).tar.gz -C /source .
```

### Start Rackora again

```bash
docker compose start rackora
```

Test your backups regularly.

---

## Development

### Requirements

- Node.js 22 or newer
- pnpm
- Docker
- Git

### Clone the repository

```bash
git clone https://github.com/<github-username>/rackora.git
cd rackora
```

### Install dependencies

```bash
corepack enable
pnpm install
```

### Create the environment file

```bash
cp .env.example .env
```

### Start development services

```bash
docker compose -f compose.dev.yml up -d
```

### Start the development server

```bash
pnpm dev
```

### Run tests

```bash
pnpm test
```

### Run linting

```bash
pnpm lint
```

### Create a production build

```bash
pnpm build
```

---

## Suggested repository structure

```text
rackora/
├── apps/
│   ├── web/
│   ├── server/
│   └── agent/
├── packages/
│   ├── shared/
│   ├── ui/
│   └── config/
├── docs/
│   └── images/
├── prisma/
├── scripts/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
├── compose.yml
├── compose.dev.yml
├── Dockerfile
├── LICENSE
├── README.md
└── SECURITY.md
```

---

## Security

Security is an important part of Rackora.

The project should follow these principles:

- Use a dedicated read-only Proxmox account
- Never store integration secrets as plain text
- Encrypt sensitive values at rest
- Use secure, random session secrets
- Use HTTPS for remote access
- Do not expose Docker sockets over TCP
- Run agents only on trusted hosts
- Limit container privileges
- Keep dependencies updated
- Validate all incoming agent data
- Rate-limit authentication endpoints
- Add audit logging for sensitive actions

Please report security issues privately instead of opening a public issue.

See [SECURITY.md](SECURITY.md) for the reporting process.

---

## Roadmap

### Phase 1 — Foundation

- [ ] Repository and monorepo setup
- [ ] Authentication
- [ ] Responsive dashboard shell
- [ ] SQLite database
- [ ] Settings page
- [ ] Docker production build
- [ ] GitHub Container Registry publishing

### Phase 2 — Proxmox

- [ ] Add Proxmox connection
- [ ] Proxmox node overview
- [ ] VM and LXC overview
- [ ] Storage overview
- [ ] Node health cards
- [ ] Proxmox connection test

### Phase 3 — Rackora Agent

- [ ] Agent registration
- [ ] Token-based authentication
- [ ] Docker container inventory
- [ ] Host CPU and memory metrics
- [ ] Disk usage
- [ ] Temperatures
- [ ] Agent offline detection

### Phase 4 — Monitoring

- [ ] Ping checks
- [ ] HTTP checks
- [ ] Configurable thresholds
- [ ] Alert history
- [ ] Discord notifications
- [ ] Telegram notifications
- [ ] Update detection

### Phase 5 — Stable release

- [ ] Backup and restore documentation
- [ ] Upgrade and rollback testing
- [ ] Security review
- [ ] Multi-architecture images
- [ ] Installation wizard
- [ ] Public documentation website
- [ ] Version `1.0.0`

---

## Contributing

Contributions are welcome.

Before starting a large change:

1. Search existing issues.
2. Open a feature request or discussion.
3. Explain the problem you want to solve.
4. Wait for agreement on the implementation direction.
5. Create a focused pull request.

### Pull request checklist

- [ ] The code builds successfully
- [ ] Tests pass
- [ ] Linting passes
- [ ] New behavior is documented
- [ ] No secrets are included
- [ ] The change is focused and understandable
- [ ] Screenshots are included for UI changes

---

## Bug reports

A useful bug report includes:

- Rackora version
- Installation method
- Operating system
- Docker version
- Browser
- Relevant logs
- Steps to reproduce
- Expected result
- Actual result
- Screenshots where useful

Remove passwords, tokens, IP addresses and other sensitive information before sharing logs.

---

## Feature requests

Feature requests should explain:

- The problem
- The proposed solution
- Who benefits from it
- Possible alternatives
- Whether you are willing to help implement it

---

## Versioning

Rackora follows [Semantic Versioning](https://semver.org/).

Examples:

```text
1.0.0  Stable release
1.1.0  Backwards-compatible feature
1.1.1  Backwards-compatible bug fix
2.0.0  Breaking change
```

Development versions may use pre-release tags:

```text
0.1.0-alpha.1
0.1.0-beta.1
1.0.0-rc.1
```

---

## License

Rackora is available under the MIT License.

See [LICENSE](LICENSE) for the full license text.

---

## Disclaimer

Rackora is an independent open-source project.

It is not affiliated with, endorsed by or sponsored by Proxmox Server Solutions GmbH, Docker, Inc. or any other integration vendor. Product names and trademarks belong to their respective owners.

Rackora provides monitoring information on a best-effort basis. Always verify critical infrastructure information directly in the original management interface.

---

## Support the project

You can support Rackora by:

- Starring the repository
- Reporting bugs
- Suggesting improvements
- Improving the documentation
- Testing new releases
- Contributing code
- Sharing Rackora with other homelab users

---

<p align="center">
  Built for the self-hosting and homelab community.
</p>
