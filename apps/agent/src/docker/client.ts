import http from "node:http";
import type {
  DockerClient,
  DockerContainerInspect,
  DockerContainerSummary,
  DockerImageSummary,
  DockerInfoResponse,
  DockerStatsResponse,
} from "./types.js";

export type DockerSocketClientOptions = {
  socketPath?: string;
  timeoutMs?: number;
};

/**
 * Minimal read-only Docker Engine client over the Unix socket.
 * Only ping/info/list/inspect/stats are implemented.
 */
export function createDockerSocketClient(
  options: DockerSocketClientOptions = {},
): DockerClient {
  const socketPath = options.socketPath ?? "/var/run/docker.sock";
  const timeoutMs = options.timeoutMs ?? 5_000;

  async function request<T>(
    method: "GET" | "HEAD",
    path: string,
  ): Promise<T> {
    const body = await rawRequest(method, path);
    if (body.length === 0) {
      return undefined as T;
    }
    return JSON.parse(body) as T;
  }

  function rawRequest(method: "GET" | "HEAD", path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath,
          path,
          method,
          timeout: timeoutMs,
          headers: {
            host: "localhost",
            accept: "application/json",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              resolve(text);
              return;
            }
            reject(
              new Error(
                `Docker API ${method} ${path} failed (${res.statusCode ?? 0})`,
              ),
            );
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error(`Docker API ${method} ${path} timed out`));
      });
      req.on("error", reject);
      req.end();
    });
  }

  return {
    async ping() {
      try {
        await rawRequest("GET", "/_ping");
        return true;
      } catch {
        return false;
      }
    },

    async info() {
      return request<DockerInfoResponse>("GET", "/info");
    },

    async listContainers(options) {
      const all = options?.all === false ? "false" : "true";
      return request<DockerContainerSummary[]>(
        "GET",
        `/containers/json?all=${all}`,
      );
    },

    async inspectContainer(id) {
      return request<DockerContainerInspect>(
        "GET",
        `/containers/${encodeURIComponent(id)}/json`,
      );
    },

    async containerStats(id) {
      // stream=0 → one-shot stats sample with precpu_stats for CPU%.
      return request<DockerStatsResponse>(
        "GET",
        `/containers/${encodeURIComponent(id)}/stats?stream=0&one-shot=1`,
      );
    },

    async listImages() {
      return request<DockerImageSummary[]>("GET", "/images/json");
    },
  };
}
