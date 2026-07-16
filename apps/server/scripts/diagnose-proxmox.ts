/**
 * Development-only diagnostic: polls the saved Proxmox integration and prints
 * safe collection stats. Never prints token secrets or Authorization headers.
 */
import { loadEnvironment } from "../src/config/load-env.js";
import { loadConfig } from "../src/config/env.js";
import { openDatabase } from "../src/db/client.js";
import { EncryptionService } from "../src/services/encryption.js";
import { loadProxmoxConfig, pollProxmoxIntegration } from "../src/services/integrations.js";
import { ProxmoxClient } from "../src/integrations/proxmox/client.js";
import { normalizeProxmoxSnapshot } from "../src/integrations/proxmox/normalize.js";
import { aggregateCpu } from "../src/services/proxmox-overview.js";
import {
  formatCpuUsage,
} from "@rackora/shared";

loadEnvironment();
const config = loadConfig();
const { db, close } = await openDatabase();
const encryption = new EncryptionService(config.masterEncryptionKey);

const rows = await db.query.integrations.findMany();
const proxmox = rows.find((row) => row.type === "proxmox");
if (!proxmox) {
  console.log("No Proxmox integration found");
  close();
  process.exit(1);
}

const loaded = await loadProxmoxConfig(db, encryption, proxmox.id);
if (!loaded) {
  console.log("Could not load integration config");
  close();
  process.exit(1);
}

console.log("Integration:", proxmox.name, proxmox.id);
console.log("Base URL:", loaded.config.baseUrl);
console.log("Token ID:", loaded.config.tokenId);

const client = new ProxmoxClient(loaded.config, {
  allowInsecureTls: config.allowInsecureTls,
});

try {
  const raw = await client.collect();
  console.log("\n--- Raw collection ---");
  console.log("Version:", raw.version);
  console.log("Nodes from /nodes:", raw.nodes.length, raw.nodes.map((n) => ({
    node: n.node,
    status: n.status,
    maxcpu: n.maxcpu,
    mem: n.mem,
    maxmem: n.maxmem,
    cpu: n.cpu,
  })));
  console.log("Resources from /cluster/resources:", raw.resources.length);
  console.log("Resource types:", [...new Set(raw.resources.map((r) => r.type))].join(", "));
  console.log("QEMU count:", raw.resources.filter((r) => r.type === "qemu" && r.template !== 1).length);
  console.log("LXC count:", raw.resources.filter((r) => r.type === "lxc").length);
  console.log("Node-type resources:", raw.resources.filter((r) => r.type === "node").length);
  console.log("Node status keys:", Object.keys(raw.nodeStatus));
  for (const [node, status] of Object.entries(raw.nodeStatus)) {
    console.log(`  ${node} status:`, status ? {
      cpu: status.cpu,
      memory: status.memory,
      rootfs: status.rootfs,
      uptime: status.uptime,
    } : "FAILED");
  }
  for (const [node, storages] of Object.entries(raw.storages)) {
    console.log(`  ${node} storage count:`, storages.length);
    if (storages[0]) {
      console.log(`    first:`, storages[0].storage, storages[0].used, storages[0].total);
    }
  }

  const normalized = normalizeProxmoxSnapshot(raw);
  console.log("\n--- CPU diagnostics (dev) ---");
  for (const node of normalized.nodes) {
    const rawStatusCpu = raw.nodeStatus[node.name]?.cpu;
    const rawListCpu = raw.nodes.find((entry) => entry.node === node.name)?.cpu;
    console.log(`  ${node.name}:`);
    console.log(`    raw Proxmox CPU ratio (status):`, rawStatusCpu ?? "missing");
    console.log(`    raw Proxmox CPU ratio (nodes list):`, rawListCpu ?? "missing");
    console.log(`    normalized CPU ratio:`, node.cpuRatio ?? "missing");
    console.log(
      `    normalized CPU percent:`,
      node.cpuRatio !== undefined ? node.cpuRatio * 100 : "missing",
    );
  }
  const aggregated = aggregateCpu(normalized.nodes);
  console.log("  aggregated CPU ratio:", aggregated.usageRatio ?? "missing");
  console.log("  aggregated CPU percent:", aggregated.usagePercent);
  console.log(
    "  displayed CPU:",
    formatCpuUsage({
      ratio: aggregated.usageRatio,
      percent: aggregated.usagePercent,
      available: aggregated.available,
    }),
  );

  console.log("\n--- Normalized ---");
  console.log("Collection status:", raw.collectionStatus);
  console.log("Warnings:", raw.warnings.length);
  for (const warning of raw.warnings) {
    console.log(" -", warning.message);
  }
  console.log("Nodes:", normalized.nodes.length);
  for (const node of normalized.nodes) {
    console.log(
      `  ${node.name}: cpuRatio=${node.cpuRatio ?? "missing"} cpuPercent=${node.cpuPercent}% cores=${node.cpuCount} mem=${node.memoryBytes}/${node.maxMemoryBytes} guests=${node.guests.length} storages=${node.storages.length}`,
    );
  }

  const poll = await pollProxmoxIntegration(db, encryption, config.allowInsecureTls, proxmox.id);
  console.log("\nPoll result:", poll);
} catch (error) {
  console.error("Collection failed:", error instanceof Error ? error.message : error);
  close();
  process.exit(1);
}

close();
