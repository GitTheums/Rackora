import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { RackoraDatabase } from "./client.js";

export async function runMigrations(db: RackoraDatabase): Promise<void> {
  const serverRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const migrationsFolder = path.join(serverRoot, "drizzle");

  await migrate(db, { migrationsFolder });
}
