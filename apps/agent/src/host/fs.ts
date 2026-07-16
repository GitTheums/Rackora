import {
  existsSync,
  readdirSync,
  readFileSync,
  statfsSync,
} from "node:fs";
import path from "node:path";

export type HostFs = {
  readFile: (filePath: string) => string;
  readdir: (dirPath: string) => string[];
  exists: (targetPath: string) => boolean;
  statfs: (targetPath: string) => {
    bsize: number;
    blocks: number;
    bfree: number;
    bavail: number;
  };
  join: (...parts: string[]) => string;
};

export type HostFsLayout = {
  /** Directory containing host /proc, /sys, /etc mounts (often `/host`). */
  prefix: string;
  /**
   * Host root filesystem mount used for statfs on allowlisted mountpoints
   * (often `/host/root` when `/` is bind-mounted there).
   */
  rootfs: string;
};

/**
 * Resolve the host filesystem layout used inside the agent container.
 * Prefers Compose mounts under `/host` when present.
 */
export function resolveHostFsLayout(
  env: NodeJS.ProcessEnv = process.env,
): HostFsLayout {
  const configured = env.HOST_ROOT?.trim();
  if (configured && configured.length > 0) {
    const rootfs =
      env.HOST_ROOTFS?.trim() ||
      (existsSync(path.join(configured, "root"))
        ? path.join(configured, "root")
        : configured === "/"
          ? "/"
          : configured);
    return { prefix: configured, rootfs };
  }

  if (existsSync("/host/proc")) {
    return {
      prefix: "/host",
      rootfs: existsSync("/host/root") ? "/host/root" : "/host",
    };
  }

  return { prefix: "/", rootfs: "/" };
}

export function createRootHostFs(rootDir = "/"): HostFs {
  return createHostFs({ prefix: rootDir, rootfs: rootDir });
}

export function createHostFs(layout: HostFsLayout): HostFs {
  const prefix = layout.prefix === "/" ? "/" : layout.prefix;
  const rootfs = layout.rootfs === "/" ? "/" : layout.rootfs;

  const resolveVirtual = (...parts: string[]) => {
    if (prefix === "/") {
      return path.posix.join("/", ...parts.map(stripLeadingSlash));
    }
    return path.join(prefix, ...parts.map(stripLeadingSlash));
  };

  const resolveRootfs = (mountpoint: string) => {
    if (rootfs === "/") {
      return mountpoint === "/"
        ? "/"
        : path.posix.join("/", stripLeadingSlash(mountpoint));
    }
    if (mountpoint === "/") {
      return rootfs;
    }
    return path.join(rootfs, stripLeadingSlash(mountpoint));
  };

  return {
    readFile(filePath) {
      try {
        return readFileSync(resolveVirtual(filePath), "utf8");
      } catch (error) {
        // Prefer host rootfs for /etc files when only os-release is bind-mounted
        // under the host prefix (Compose mounts /host/root for the full tree).
        if (filePath.startsWith("/etc/")) {
          try {
            return readFileSync(resolveRootfs(filePath), "utf8");
          } catch {
            throw error;
          }
        }
        throw error;
      }
    },
    readdir(dirPath) {
      return readdirSync(resolveVirtual(dirPath));
    },
    exists(targetPath) {
      return existsSync(resolveVirtual(targetPath));
    },
    statfs(targetPath) {
      // Mountpoints from host /proc/mounts refer to the host root filesystem.
      const stats = statfsSync(resolveRootfs(targetPath));
      return {
        bsize: Number(stats.bsize),
        blocks: Number(stats.blocks),
        bfree: Number(stats.bfree),
        bavail: Number(stats.bavail),
      };
    },
    join: resolveVirtual,
  };
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}
