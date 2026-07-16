import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HostFs } from "./fs.js";

const FIXTURE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "linux-root",
);

export function createFixtureHostFs(options?: {
  rootDir?: string;
  /** Optional fake block sizes keyed by mountpoint. */
  volumes?: Record<
    string,
    { bsize: number; blocks: number; bfree: number; bavail: number }
  >;
}): HostFs {
  const rootDir = options?.rootDir ?? FIXTURE_ROOT;
  const volumes = options?.volumes ?? {
    "/": { bsize: 4096, blocks: 1_000_000, bfree: 400_000, bavail: 350_000 },
    "/boot": { bsize: 4096, blocks: 100_000, bfree: 50_000, bavail: 45_000 },
    "/mnt/data": {
      bsize: 4096,
      blocks: 2_000_000,
      bfree: 1_000_000,
      bavail: 900_000,
    },
  };

  let statReads = 0;

  const resolve = (target: string) => {
    const relative = target.replace(/^\/+/, "");
    return path.join(rootDir, relative);
  };

  return {
    readFile(filePath) {
      if (filePath === "/proc/stat") {
        statReads += 1;
        const second = path.join(rootDir, "proc", "stat.second");
        // Allow an optional core-count read before the CPU sample pair.
        if (statReads >= 3 && existsSync(second)) {
          return readFileSync(second, "utf8");
        }
      }
      return readFileSync(resolve(filePath), "utf8");
    },
    readdir(dirPath) {
      return readdirSync(resolve(dirPath));
    },
    exists(targetPath) {
      return existsSync(resolve(targetPath));
    },
    statfs(targetPath) {
      const volume = volumes[targetPath];
      if (!volume) {
        throw new Error(`statfs unavailable for ${targetPath}`);
      }
      return volume;
    },
    join: (...parts) => path.posix.join("/", ...parts.map((p) => p.replace(/^\/+/, ""))),
  };
}
