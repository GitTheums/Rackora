import { describe, expect, it } from "vitest";
import {
  parseMasterEncryptionKey,
  sanitizeEnvValue,
} from "./env.js";
import { resolveDatabaseFilePath } from "./paths.js";

describe("environment configuration", () => {
  it("strips placeholder angle brackets from env values", () => {
    expect(sanitizeEnvValue("<abc123>")).toBe("abc123");
    expect(
      parseMasterEncryptionKey(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ).length,
    ).toBe(32);
    expect(
      parseMasterEncryptionKey(
        "<0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef>",
      ).length,
    ).toBe(32);
  });

  it("resolves database paths from the monorepo root", () => {
    const root = "/workspace/rackora";
    expect(resolveDatabaseFilePath({ DATA_DIR: "./data" }, root)).toBe(
      "/workspace/rackora/data/rackora.db",
    );
    expect(
      resolveDatabaseFilePath({ DATABASE_PATH: "./data/custom.db" }, root),
    ).toBe("/workspace/rackora/data/custom.db");
  });
});
