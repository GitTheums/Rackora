import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function findMonorepoRoot(
  startDir = path.dirname(fileURLToPath(import.meta.url)),
): string {
  let current = startDir;

  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }

    current = parent;
  }
}

export function resolvePathFromRoot(
  configuredPath: string,
  rootDir: string,
): string {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.resolve(rootDir, configuredPath);
}

export function resolveDatabaseFilePath(
  env: NodeJS.ProcessEnv,
  rootDir: string,
): string {
  const configured =
    env.DATABASE_PATH ??
    (env.DATA_DIR ? path.join(env.DATA_DIR, "rackora.db") : "./data/rackora.db");

  return resolvePathFromRoot(configured, rootDir);
}
