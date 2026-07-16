import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_ID_HEADER,
  AGENT_NONCE_HEADER,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
  TELEMETRY_SCHEMA_VERSION,
  type AgentTelemetryV1,
} from "@rackora/shared";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./config/env.js";
import { signAgentPayload } from "./services/agent-auth.js";
import {
  cookieHeader,
  createTestApp,
  extractCookie,
} from "./test/helpers.js";

async function authenticate(
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
) {
  const status = await app.inject({ method: "GET", url: "/api/setup/status" });
  const csrf = extractCookie(status.headers["set-cookie"], CSRF_COOKIE_NAME);
  const setup = await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader({ [CSRF_COOKIE_NAME]: csrf }),
      "x-csrf-token": csrf ?? "",
    },
    payload: { username: "admin", password: "password123" },
  });

  const session = extractCookie(
    setup.headers["set-cookie"],
    SESSION_COOKIE_NAME,
  );
  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: cookieHeader({ [SESSION_COOKIE_NAME]: session }) },
  });
  const body = me.json() as { csrfToken: string };

  return {
    cookie: cookieHeader({
      [SESSION_COOKIE_NAME]: session,
      [CSRF_COOKIE_NAME]: csrf,
    }),
    csrfToken: body.csrfToken,
  };
}

function sampleTelemetry(): AgentTelemetryV1 {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    collectedAt: "2026-07-16T11:00:00.000Z",
    agent: { name: "host-a", version: "0.1.0" },
    host: {
      hostname: "host-a",
      os: "Debian GNU/Linux 12 (bookworm)",
      architecture: "x64",
      uptimeSeconds: 1000,
      cpu: {
        usagePercent: 22.5,
        loadAverage: [0.5, 0.4, 0.3],
        cores: 4,
      },
      memory: {
        totalBytes: 8_000_000_000,
        usedBytes: 2_000_000_000,
        availableBytes: 6_000_000_000,
      },
      filesystems: [
        {
          mountpoint: "/",
          fstype: "ext4",
          totalBytes: 100_000,
          usedBytes: 40_000,
          availableBytes: 60_000,
        },
      ],
      temperatures: [
        { name: "x86_pkg_temp", celsius: 45.5, source: "thermal" },
      ],
    },
    docker: {
      available: true,
      engine: { version: "27.1.0" },
      containers: [
        {
          id: "abc123def456",
          name: "web",
          image: "nginx:1.27",
          state: "running",
          health: "healthy",
          createdAt: "2026-07-16T10:00:00.000Z",
          labels: { "com.docker.compose.service": "web" },
          stats: {
            cpuPercent: 3.5,
            memoryUsageBytes: 20_000_000,
            memoryLimitBytes: 100_000_000,
            netRxBytes: 1,
            netTxBytes: 2,
            blockReadBytes: 3,
            blockWriteBytes: 4,
          },
        },
      ],
      images: [
        {
          id: "sha256:deadbeef",
          repositoryTags: ["nginx:1.27"],
          digests: ["nginx@sha256:abcd"],
          sizeBytes: 50_000_000,
        },
      ],
      containerTotal: 1,
      imageTotal: 1,
    },
    batch: { index: 0, total: 1, truncated: false },
  };
}

describe("agent telemetry ingest", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("stores current telemetry state and metric samples", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/api/agents/enrollment-tokens",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: {
        name: "host-a",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const tokenBody = tokenResponse.json() as { token: string };

    const enroll = await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-a" },
    });
    const enrolled = enroll.json() as { agentId: string; secret: string };

    const telemetry = sampleTelemetry();
    const rawBody = JSON.stringify({ status: "ok", telemetry });
    const timestamp = String(Date.now());
    const nonce = "telemetry-nonce-1";
    const signature = signAgentPayload(
      enrolled.secret,
      timestamp,
      nonce,
      rawBody,
    );

    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/agents/heartbeat",
      headers: {
        "content-type": "application/json",
        [AGENT_ID_HEADER]: enrolled.agentId,
        [AGENT_TIMESTAMP_HEADER]: timestamp,
        [AGENT_NONCE_HEADER]: nonce,
        [AGENT_SIGNATURE_HEADER]: signature,
      },
      payload: rawBody,
    });
    expect(heartbeat.statusCode).toBe(200);

    const state = await app.inject({
      method: "GET",
      url: `/api/agents/${enrolled.agentId}/telemetry`,
      headers: { cookie: auth.cookie },
    });
    expect(state.statusCode).toBe(200);
    const stateBody = state.json() as {
      telemetry: AgentTelemetryV1;
      status: string;
    };
    expect(stateBody.status).toBe("ok");
    expect(stateBody.telemetry.docker.containers[0]?.name).toBe("web");
    expect(stateBody.telemetry.host.temperatures[0]?.celsius).toBe(45.5);

    const metrics = await app.inject({
      method: "GET",
      url: `/api/agents/${enrolled.agentId}/metrics`,
      headers: { cookie: auth.cookie },
    });
    expect(metrics.statusCode).toBe(200);
    const metricBody = metrics.json() as {
      samples: Array<{ metricKey: string; value: number }>;
    };
    expect(
      metricBody.samples.some(
        (sample) =>
          sample.metricKey === "host.cpu.usage_percent" &&
          sample.value === 22.5,
      ),
    ).toBe(true);
    expect(
      metricBody.samples.some(
        (sample) => sample.metricKey === "docker.container.cpu_percent",
      ),
    ).toBe(true);

    const summary = await app.inject({
      method: "GET",
      url: "/api/docker/summary",
      headers: { cookie: auth.cookie },
    });
    expect(summary.statusCode).toBe(200);
    const summaryBody = summary.json() as {
      pageState: string;
      runningContainers: number;
      totalContainers: number;
    };
    expect(summaryBody.pageState).toBe("ready");
    expect(summaryBody.runningContainers).toBe(1);
    expect(summaryBody.totalContainers).toBe(1);

    const containers = await app.inject({
      method: "GET",
      url: "/api/docker/containers",
      headers: { cookie: auth.cookie },
    });
    expect(containers.statusCode).toBe(200);
    const containerBody = containers.json() as {
      containers: Array<Record<string, unknown>>;
    };
    expect(containerBody.containers).toHaveLength(1);
    expect(containerBody.containers[0]?.name).toBe("web");
    expect(JSON.stringify(containerBody)).not.toContain(enrolled.secret);
    expect(JSON.stringify(containerBody)).not.toMatch(
      /agentSecret|enrollmentToken|tokenHash|Env|SECRET=/i,
    );

    const hosts = await app.inject({
      method: "GET",
      url: "/api/hosts",
      headers: { cookie: auth.cookie },
    });
    expect(hosts.statusCode).toBe(200);
    const hostsBody = hosts.json() as {
      hosts: Array<{ hostname: string | null; agentVersion: string | null }>;
    };
    expect(hostsBody.hosts[0]?.hostname).toBe("host-a");
    expect(hostsBody.hosts[0]?.agentVersion).toBe("0.1.0");

    const detail = await app.inject({
      method: "GET",
      url: `/api/docker/containers/${enrolled.agentId}/abc123def456`,
      headers: { cookie: auth.cookie },
    });
    expect(detail.statusCode).toBe(200);

    await app.close();
  });

  it("reports waiting_for_telemetry when an agent exists without payloads", async () => {
    const testApp = await createTestApp();
    cleanup = testApp.cleanup;
    const { app } = testApp;
    const auth = await authenticate(app);

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/api/agents/enrollment-tokens",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: {
        name: "host-b",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const tokenBody = tokenResponse.json() as { token: string };
    await app.inject({
      method: "POST",
      url: "/api/agents/enroll",
      headers: { "content-type": "application/json" },
      payload: { token: tokenBody.token, name: "host-b" },
    });

    const summary = await app.inject({
      method: "GET",
      url: "/api/docker/summary",
      headers: { cookie: auth.cookie },
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      pageState: "waiting_for_telemetry",
      totalAgents: 1,
      totalContainers: 0,
    });

    await app.close();
  });
});
