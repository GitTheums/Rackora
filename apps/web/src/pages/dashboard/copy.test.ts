import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DUTCH_PATTERNS = [
  /Nog niet gekoppeld/i,
  /Geen [a-z]/i,
  /Historie nog niet/i,
  /Proxmox bijgewerkt/i,
  /verouderd/i,
  /Alle statussen/i,
  /Alle nodes/i,
  /Zoek op/i,
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("English-only dashboard copy", () => {
  it("does not contain Dutch user-facing strings in dashboard pages", () => {
    const root = import.meta.dirname;
    const files = walk(root);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of DUTCH_PATTERNS) {
        expect(content, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
