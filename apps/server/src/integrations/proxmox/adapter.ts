import {
  connectionTestResultSchema,
  proxmoxConfigSchema,
  type ConnectionTestResult,
  type Infrastructure,
  type ProxmoxConfig,
} from "@rackora/shared";
import type { IntegrationAdapter } from "../adapter.js";
import { HttpRequestError } from "../http.js";
import { SsrfError, redactUrl } from "../ssrf.js";
import { ProxmoxClient, type ProxmoxClientOptions } from "./client.js";
import { normalizeProxmoxSnapshot } from "./normalize.js";
import type { ProxmoxRawSnapshot } from "./types.js";

const SECRET_PATTERNS = [
  /PVEAPIToken=[^\s]+/gi,
  /tokenSecret["']?\s*[:=]\s*["'][^"']+["']/gi,
  /Authorization:\s*[^\s]+/gi,
  // user:pass@host
  /:\/\/[^/\s:@]+:[^/\s@]+@/g,
];

export type ProxmoxAdapterOptions = ProxmoxClientOptions;

export class ProxmoxAdapter
  implements IntegrationAdapter<ProxmoxConfig, ProxmoxRawSnapshot, Infrastructure>
{
  readonly type = "proxmox";
  readonly configSchema = proxmoxConfigSchema;

  constructor(private readonly options: ProxmoxAdapterOptions) {}

  private createClient(config: ProxmoxConfig): ProxmoxClient {
    const parsed = this.configSchema.parse(config);
    return new ProxmoxClient(parsed, this.options);
  }

  async testConnection(config: ProxmoxConfig): Promise<ConnectionTestResult> {
    try {
      const client = this.createClient(config);
      const version = await client.getVersion();
      const warnings: string[] = [];

      const nodes = await client.getNodes().catch(() => []);
      const firstNode = nodes[0]?.node;
      if (firstNode) {
        const status = await client.getNodeStatus(firstNode);
        if (status === null) {
          warnings.push(
            "Node metrics unavailable — grant Sys.Audit permission on the API token",
          );
        }

        const [qemu, lxc] = await Promise.all([
          client.getNodeQemu(firstNode),
          client.getNodeLxc(firstNode),
        ]);
        const resources = await client.getClusterResources("vm").catch(() => []);
        if (qemu.length === 0 && lxc.length === 0 && resources.length === 0) {
          warnings.push(
            "No workloads visible — grant VM.Audit permission on the API token",
          );
        }

        const storage = await client.getNodeStorage(firstNode);
        const clusterStorage = await client.getClusterStorage();
        if (storage.length === 0 && clusterStorage.length === 0) {
          warnings.push(
            "No storage visible — grant Datastore.Audit permission on the API token",
          );
        }
      }

      return connectionTestResultSchema.parse({
        ok: true,
        message: warnings.length > 0
          ? "Connected to Proxmox with limited permissions"
          : "Connected to Proxmox successfully",
        version: version.version,
        release: version.release,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (error) {
      return connectionTestResultSchema.parse({
        ok: false,
        message: this.redactError(error),
      });
    }
  }

  async collect(config: ProxmoxConfig): Promise<ProxmoxRawSnapshot> {
    const client = this.createClient(config);
    return client.collect();
  }

  normalize(raw: ProxmoxRawSnapshot): Infrastructure {
    return normalizeProxmoxSnapshot(raw);
  }

  redactError(error: unknown): string {
    let message: string;

    if (error instanceof SsrfError) {
      message = error.message;
    } else if (error instanceof HttpRequestError) {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = "Unknown Proxmox error";
    }

    let redacted = message;
    for (const pattern of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, "[redacted]");
    }

    // Extra pass for any URL-shaped fragments.
    redacted = redacted.replace(
      /https?:\/\/[^\s]+/gi,
      (match) => redactUrl(match),
    );

    return redacted;
  }
}
