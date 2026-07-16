import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getMonorepoRoot } from "../config/load-env.js";
import { resolveDatabaseFilePath } from "../config/paths.js";
import * as schema from "./schema.js";

export type RackoraDatabase = LibSQLDatabase<typeof schema>;

export function resolveDatabasePath(databasePath?: string): string {
  if (databasePath !== undefined) {
    if (path.isAbsolute(databasePath)) {
      return databasePath;
    }

    return path.resolve(getMonorepoRoot(), databasePath);
  }

  return resolveDatabaseFilePath(process.env, getMonorepoRoot());
}

export async function openDatabase(databasePath?: string): Promise<{
  client: Client;
  db: RackoraDatabase;
  path: string;
  close: () => void;
}> {
  const resolvedPath = resolveDatabasePath(databasePath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const client = createClient({
    url: `file:${resolvedPath}`,
  });

  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");

  const db = drizzle(client, { schema });

  return {
    client,
    db,
    path: resolvedPath,
    close: () => {
      client.close();
    },
  };
}
