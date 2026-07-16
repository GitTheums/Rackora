import os from "node:os";
import {
  HOST_FILESYSTEM_ALLOWLIST,
  isAllowedFilesystemMount,
  type HostTelemetry,
} from "@rackora/shared";
import {
  createHostFs,
  resolveHostFsLayout,
  type HostFs,
} from "./fs.js";

export type CollectHostOptions = {
  fs?: HostFs;
  /** Delay between /proc/stat samples for CPU%. */
  cpuSampleMs?: number;
  sleep?: (ms: number) => Promise<void>;
  filesystemAllowlist?: readonly string[];
  env?: NodeJS.ProcessEnv;
};

export async function collectHostTelemetry(
  options: CollectHostOptions = {},
): Promise<HostTelemetry> {
  const fs =
    options.fs ??
    createHostFs(resolveHostFsLayout(options.env ?? process.env));
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cpuSampleMs = options.cpuSampleMs ?? 200;
  const allowlist = options.filesystemAllowlist ?? HOST_FILESYSTEM_ALLOWLIST;

  const hostname = readHostname(fs);
  const osName = readOsName(fs);
  const architecture = os.arch();
  const uptimeSeconds = readUptimeSeconds(fs);
  const loadAverage = readLoadAverage(fs);
  const cores = Math.max(1, readCpuCount(fs) || os.cpus().length || 1);
  const usagePercent = await readCpuUsagePercent(fs, sleep, cpuSampleMs);
  const memory = readMemory(fs);
  const filesystems = readFilesystems(fs, allowlist);
  const temperatures = readTemperatures(fs);

  return {
    hostname,
    os: osName,
    architecture,
    uptimeSeconds,
    cpu: {
      usagePercent,
      loadAverage,
      cores,
    },
    memory,
    filesystems,
    temperatures,
  };
}

function readHostname(fs: HostFs): string {
  for (const candidate of ["/etc/hostname", "/proc/sys/kernel/hostname"]) {
    try {
      const value = fs.readFile(candidate).trim();
      if (value.length > 0) {
        return value.slice(0, 255);
      }
    } catch {
      // try next candidate
    }
  }
  return os.hostname().slice(0, 255);
}

function readOsName(fs: HostFs): string {
  try {
    const content = fs.readFile("/etc/os-release");
    const pretty = /^PRETTY_NAME=(.*)$/m.exec(content)?.[1];
    if (pretty) {
      return pretty.replace(/^"|"$/g, "").slice(0, 128);
    }
  } catch {
    // fall through
  }
  return `${os.type()} ${os.release()}`.slice(0, 128);
}

function readUptimeSeconds(fs: HostFs): number {
  try {
    const raw = fs.readFile("/proc/uptime").trim().split(/\s+/)[0];
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  } catch {
    // fall through
  }
  return Math.floor(os.uptime());
}

function readLoadAverage(fs: HostFs): [number, number, number] {
  try {
    const parts = fs.readFile("/proc/loadavg").trim().split(/\s+/);
    const values = parts.slice(0, 3).map(Number);
    if (values.length === 3 && values.every((v) => Number.isFinite(v))) {
      return [values[0]!, values[1]!, values[2]!];
    }
  } catch {
    // fall through
  }
  const fallback = os.loadavg();
  return [fallback[0] ?? 0, fallback[1] ?? 0, fallback[2] ?? 0];
}

function readCpuCount(fs: HostFs): number {
  try {
    const cpuinfo = fs.readFile("/proc/cpuinfo");
    const fromInfo = cpuinfo
      .split("\n")
      .filter((line) => /^processor\s*:/.test(line)).length;
    if (fromInfo > 0) {
      return fromInfo;
    }
  } catch {
    // fall through to /proc/stat
  }

  try {
    const content = fs.readFile("/proc/stat");
    const count = content
      .split("\n")
      .filter((line) => /^cpu\d+/.test(line)).length;
    return count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

async function readCpuUsagePercent(
  fs: HostFs,
  sleep: (ms: number) => Promise<void>,
  sampleMs: number,
): Promise<number> {
  try {
    const first = readProcStatTotals(fs);
    await sleep(sampleMs);
    const second = readProcStatTotals(fs);
    const idleDelta = second.idle - first.idle;
    const totalDelta = second.total - first.total;
    if (totalDelta <= 0) {
      return 0;
    }
    const usage = (1 - idleDelta / totalDelta) * 100;
    if (!Number.isFinite(usage) || usage < 0) {
      return 0;
    }
    return Math.min(100, Math.round(usage * 100) / 100);
  } catch {
    return 0;
  }
}

function readProcStatTotals(fs: HostFs): { idle: number; total: number } {
  const line = fs
    .readFile("/proc/stat")
    .split("\n")
    .find((entry) => entry.startsWith("cpu "));
  if (!line) {
    throw new Error("cpu line missing");
  }
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const total = parts.reduce((sum, value) => sum + (value || 0), 0);
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  return { idle, total };
}

function readMemory(fs: HostFs): HostTelemetry["memory"] {
  try {
    const content = fs.readFile("/proc/meminfo");
    const total = readMeminfoValue(content, "MemTotal");
    const available = readMeminfoValue(content, "MemAvailable");
    const free = readMeminfoValue(content, "MemFree");
    const buffers = readMeminfoValue(content, "Buffers");
    const cached = readMeminfoValue(content, "Cached");
    const swapTotal = readMeminfoValue(content, "SwapTotal");
    const swapFree = readMeminfoValue(content, "SwapFree");

    const totalBytes = total;
    const availableBytes =
      available > 0 ? available : free + buffers + cached;
    const usedBytes = Math.max(0, totalBytes - availableBytes);

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      swapTotalBytes: swapTotal > 0 ? swapTotal : undefined,
      swapUsedBytes:
        swapTotal > 0 ? Math.max(0, swapTotal - swapFree) : undefined,
    };
  } catch {
    const totalBytes = os.totalmem();
    const availableBytes = os.freemem();
    return {
      totalBytes,
      usedBytes: Math.max(0, totalBytes - availableBytes),
      availableBytes,
    };
  }
}

function readMeminfoValue(content: string, key: string): number {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m").exec(content);
  if (!match?.[1]) {
    return 0;
  }
  return Number(match[1]) * 1024;
}

function readFilesystems(
  fs: HostFs,
  allowlist: readonly string[],
): HostTelemetry["filesystems"] {
  let mountsContent = "";
  try {
    mountsContent = fs.readFile("/proc/mounts");
  } catch {
    mountsContent = "";
  }

  const seen = new Set<string>();
  const result: HostTelemetry["filesystems"] = [];

  for (const line of mountsContent.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split(/\s+/);
    const mountpoint = unescapeMount(parts[1] ?? "");
    const fstype = parts[2] ?? "unknown";

    if (!mountpoint || seen.has(mountpoint)) {
      continue;
    }
    if (!isAllowedFilesystemMount(mountpoint, allowlist)) {
      continue;
    }
    if (isPseudoFs(fstype)) {
      continue;
    }

    try {
      const stats = fs.statfs(mountpoint);
      const totalBytes = stats.blocks * stats.bsize;
      const availableBytes = stats.bavail * stats.bsize;
      const usedBytes = Math.max(0, totalBytes - stats.bfree * stats.bsize);
      if (totalBytes <= 0) {
        continue;
      }
      seen.add(mountpoint);
      result.push({
        mountpoint,
        fstype,
        totalBytes,
        usedBytes,
        availableBytes,
      });
    } catch {
      // skip unreadable mounts
    }
  }

  // When host /proc/mounts is namespaced to the agent container (overlay root),
  // still report the bind-mounted host root filesystem as "/".
  if (!seen.has("/")) {
    try {
      const stats = fs.statfs("/");
      const totalBytes = stats.blocks * stats.bsize;
      const availableBytes = stats.bavail * stats.bsize;
      const usedBytes = Math.max(0, totalBytes - stats.bfree * stats.bsize);
      if (totalBytes > 0) {
        result.unshift({
          mountpoint: "/",
          fstype: "ext4",
          totalBytes,
          usedBytes,
          availableBytes,
        });
      }
    } catch {
      // rootfs unavailable
    }
  }

  return result.slice(0, 32);
}

function unescapeMount(value: string): string {
  return value
    .replace(/\\040/g, " ")
    .replace(/\\011/g, "\t")
    .replace(/\\012/g, "\n")
    .replace(/\\134/g, "\\");
}

function isPseudoFs(fstype: string): boolean {
  return [
    "proc",
    "sysfs",
    "devtmpfs",
    "devpts",
    "tmpfs",
    "cgroup",
    "cgroup2",
    "pstore",
    "bpf",
    "tracefs",
    "debugfs",
    "securityfs",
    "fusectl",
    "mqueue",
    "hugetlbfs",
    "configfs",
    "rpc_pipefs",
    "overlay",
  ].includes(fstype);
}

function readTemperatures(fs: HostFs): HostTelemetry["temperatures"] {
  const temperatures: HostTelemetry["temperatures"] = [];

  if (fs.exists("/sys/class/thermal")) {
    try {
      for (const entry of fs.readdir("/sys/class/thermal")) {
        if (!entry.startsWith("thermal_zone")) {
          continue;
        }
        try {
          const raw = fs.readFile(`/sys/class/thermal/${entry}/temp`).trim();
          const milli = Number(raw);
          if (!Number.isFinite(milli)) {
            continue;
          }
          let name = entry;
          try {
            const type = fs
              .readFile(`/sys/class/thermal/${entry}/type`)
              .trim();
            if (type) {
              name = type;
            }
          } catch {
            // keep default name
          }
          temperatures.push({
            name: name.slice(0, 128),
            celsius: milli / 1000,
            source: "thermal",
          });
        } catch {
          // skip zone
        }
      }
    } catch {
      // thermal class missing
    }
  }

  if (fs.exists("/sys/class/hwmon")) {
    try {
      for (const hwmon of fs.readdir("/sys/class/hwmon")) {
        if (!hwmon.startsWith("hwmon")) {
          continue;
        }
        let chipName = hwmon;
        try {
          const named = fs.readFile(`/sys/class/hwmon/${hwmon}/name`).trim();
          if (named) {
            chipName = named;
          }
        } catch {
          // keep default
        }

        let entries: string[] = [];
        try {
          entries = fs.readdir(`/sys/class/hwmon/${hwmon}`);
        } catch {
          continue;
        }

        for (const file of entries) {
          if (!/^temp\d+_input$/.test(file)) {
            continue;
          }
          try {
            const raw = fs
              .readFile(`/sys/class/hwmon/${hwmon}/${file}`)
              .trim();
            const milli = Number(raw);
            if (!Number.isFinite(milli)) {
              continue;
            }
            const labelFile = file.replace("_input", "_label");
            let label = file.replace("_input", "");
            try {
              if (entries.includes(labelFile)) {
                label = fs
                  .readFile(`/sys/class/hwmon/${hwmon}/${labelFile}`)
                  .trim();
              }
            } catch {
              // keep default label
            }
            temperatures.push({
              name: `${chipName}:${label}`.slice(0, 128),
              celsius: milli / 1000,
              source: "hwmon",
            });
          } catch {
            // skip sensor
          }
        }
      }
    } catch {
      // hwmon missing
    }
  }

  return temperatures.slice(0, 64);
}
