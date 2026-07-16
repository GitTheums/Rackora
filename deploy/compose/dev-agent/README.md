# Development Rackora Agent

Build and run a local read-only agent against Rackora Core.

## Prerequisites

1. Create a one-time enrollment token in **Settings → Agents**.
2. Note the Docker socket group id on the host:

```bash
stat -c '%g' /var/run/docker.sock
```

## Start

```bash
export CORE_URL=http://192.168.x.x:7575
export ENROLLMENT_TOKEN='<one-time-token>'
export AGENT_NAME=rackora-dev
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"

docker compose -f deploy/compose/dev-agent/compose.yml build
docker compose -f deploy/compose/dev-agent/compose.yml up
```

## Environment

| Variable | Description |
|---|---|
| `CORE_URL` | Rackora core base URL |
| `ENROLLMENT_TOKEN` | One-time enrollment token (first run) |
| `AGENT_NAME` | Agent name |
| `AGENT_DATA_DIR` / `DATA_DIR` | Credential directory (default `/data`) |
| `TELEMETRY_INTERVAL_SECONDS` | Heartbeat interval in seconds (mapped to `HEARTBEAT_INTERVAL_MS`) |
| `DOCKER_SOCKET` | Docker engine socket (default `/var/run/docker.sock`) |
| `DOCKER_GID` | Host docker group id for socket access |

Agent credentials are stored under `./data` on the host (bind-mounted to `/data`).
