import { eq } from "drizzle-orm";
import type { RackoraDatabase } from "../db/client.js";
import { users } from "../db/schema.js";

export async function hasAdminUser(db: RackoraDatabase): Promise<boolean> {
  const admin = await db.query.users.findFirst({
    where: eq(users.role, "admin"),
  });

  return admin !== undefined;
}

export async function findUserByUsername(
  db: RackoraDatabase,
  username: string,
) {
  return db.query.users.findFirst({
    where: eq(users.username, username),
  });
}
