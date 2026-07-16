import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { findMonorepoRoot } from "./paths.js";

let loadedRoot: string | null = null;

export function getMonorepoRoot(): string {
  if (loadedRoot === null) {
    loadedRoot = findMonorepoRoot();
  }

  return loadedRoot;
}

export function loadEnvironment(): string {
  const root = getMonorepoRoot();
  const envPath = path.join(root, ".env");

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }

  return root;
}
