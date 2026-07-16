import { describe, expect, it, vi } from "vitest";
import type { ProxmoxConfig } from "@rackora/shared";
import { assertSafeOutboundUrl, isBlockedIpAddress, redactUrl } from "../ssrf.js";
import { ProxmoxAdapter } from "./adapter.js";
import { normalizeProxmoxSnapshot } from "./normalize.js";
import {
  createProxmoxFetchMock,
  createSuccessFetchMock,
  envelope,
  fixturePartialRaw,
  fixtureRawSnapshot,
  FIXTURE_BASE_URL,
} from "./fixtures.js";

const baseConfig: ProxmoxConfig = {
  baseUrl: FIXTURE_BASE_URL,
  tokenId: "root@pam!rackora",
  tokenSecret: "super-secret-token-value",
  tlsMode: "verify",
};

describe("SSRF protections", () => {
  it("allows http(s) LAN hosts and redacts credentials from URLs", () => {
    expect(redactUrl("https://user:pass@pve.lan:8006/api")).toBe(
      "https://pve.lan:8006/api",
    );
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.10")).toBe(false);
    expect(isBlockedIpAddress("10.0.0.5")).toBe(false);
  });

  it("rejects non-http schemes, credentials, and metadata hosts", async () => {
    await expect(assertSafeOutboundUrl("ftp://pve.lan")).rejects.toThrow(
      /http/,
    );
    await expect(
      assertSafeOutboundUrl("https://user:pass@pve.lan"),
    ).rejects.toThrow(/credentials/);
    await expect(
      assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow(/not allowed/);
    await expect(
      assertSafeOutboundUrl("http://metadata.google.internal/"),
    ).rejects.toThrow(/not allowed/);
  });
});

describe("Proxmox normalize", () => {
  it("maps nodes, qemu, lxc and storage from a full fixture", () => {
    const result = normalizeProxmoxSnapshot(fixtureRawSnapshot);

    expect(result.nodes).toHaveLength(2);
    const pve1 = result.nodes.find((node) => node.name === "pve1");
    expect(pve1?.guests.map((guest) => guest.name).sort()).toEqual([
      "docker-host",
      "home-assistant",
    ]);
    expect(pve1?.guests.find((guest) => guest.name === "docker-host")?.kind).toBe(
      "qemu",
    );
    expect(
      pve1?.guests.find((guest) => guest.name === "home-assistant")?.kind,
    ).toBe("lxc");
    expect(pve1?.storages[0]?.name).toBe("local-lvm");

    // Templates are skipped.
    const pve2 = result.nodes.find((node) => node.name === "pve2");
    expect(pve2?.guests.some((guest) => guest.name === "template-ubuntu")).toBe(
      false,
    );
    expect(pve2?.guests.find((guest) => guest.name === "nas")?.state).toBe(
      "down",
    );
  });

  it("tolerates partial data and missing fields", () => {
    const result = normalizeProxmoxSnapshot(fixturePartialRaw);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.name).toBe("lonely");
    expect(result.nodes[0]?.cpuCount).toBe(4);
    expect(result.nodes[0]?.memoryBytes).toBe(1024);
    expect(result.nodes[0]?.guests).toHaveLength(1);
    expect(result.nodes[0]?.guests[0]?.name).toBe("guest-50");
    expect(result.partial).toBe(true);
  });

  it("merges node-type cluster resources into node metrics", () => {
    const result = normalizeProxmoxSnapshot({
      version: { version: "9.2.4" },
      resources: [
        {
          type: "node",
          node: "pve",
          status: "online",
          cpu: 0.25,
          maxcpu: 16,
          mem: 8 * 1024 ** 3,
          maxmem: 64 * 1024 ** 3,
        },
      ],
      nodes: [{ node: "pve", status: "online" }],
      nodeStatus: { pve: null },
      storages: {},
      clusterStorage: [],
      nodeGuests: { pve: { qemu: [], lxc: [] } },
      collectionStatus: "partial",
      warnings: [],
    });

    expect(result.nodes[0]?.cpuCount).toBe(16);
    expect(result.nodes[0]?.memoryBytes).toBe(8 * 1024 ** 3);
    expect(result.nodes[0]?.cpuRatio).toBe(0.25);
    expect(result.nodes[0]?.cpuPercent).toBe(25);
  });
});

describe("Proxmox adapter", () => {
  it("tests connection successfully on 200", async () => {
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      fetchImpl: createSuccessFetchMock() as never,
    });

    const result = await adapter.testConnection(baseConfig);
    expect(result.ok).toBe(true);
    expect(result.version).toBe("8.2.2");
  });

  it("fails connection on 401 without leaking the token", async () => {
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      fetchImpl: createProxmoxFetchMock({
        "/api2/json/version": { status: 401, body: "{}" },
      }) as never,
    });

    const result = await adapter.testConnection(baseConfig);
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("authentication");
    expect(result.message).not.toContain(baseConfig.tokenSecret);
    expect(result.message).not.toContain("PVEAPIToken=");
  });

  it("surfaces timeouts cleanly", async () => {
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      timeoutMs: 50,
      fetchImpl: createProxmoxFetchMock({
        "/api2/json/version": {
          status: 200,
          body: envelope({ version: "8.2.2" }),
          delayMs: 500,
        },
      }) as never,
    });

    const result = await adapter.testConnection(baseConfig);
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/timed out|abort/);
  });

  it("reports self-signed TLS failures and redacts secrets", async () => {
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      fetchImpl: createProxmoxFetchMock({
        "/api2/json/version": { status: 200, tlsError: "self-signed" },
      }) as never,
    });

    const result = await adapter.testConnection(baseConfig);
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/self signed|failed/);
    expect(result.message).not.toContain(baseConfig.tokenSecret);
  });

  it("blocks insecure TLS when ALLOW_INSECURE_TLS is false", async () => {
    const fetchImpl = vi.fn();
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      fetchImpl: fetchImpl as never,
    });

    const result = await adapter.testConnection({
      ...baseConfig,
      tlsMode: "insecure",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Insecure TLS is disabled/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("collects and normalizes a full cluster snapshot", async () => {
    const adapter = new ProxmoxAdapter({
      allowInsecureTls: false,
      fetchImpl: createSuccessFetchMock() as never,
    });

    const raw = await adapter.collect(baseConfig);
    const normalized = adapter.normalize(raw);
    expect(normalized.nodes).toHaveLength(2);
    expect(normalized.nodes[0]?.guests.length).toBeGreaterThan(0);
  });

  it("redactError strips token-like material", () => {
    const adapter = new ProxmoxAdapter({ allowInsecureTls: false });
    const message = adapter.redactError(
      new Error(
        `Authorization: PVEAPIToken=${baseConfig.tokenId}=${baseConfig.tokenSecret} failed for https://user:pass@pve.lan`,
      ),
    );
    expect(message).not.toContain(baseConfig.tokenSecret);
    expect(message).not.toContain("user:pass");
    expect(message).toContain("[redacted]");
  });
});
