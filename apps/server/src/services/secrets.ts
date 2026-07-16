import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { RackoraDatabase } from "../db/client.js";
import { encryptedSecrets } from "../db/schema.js";
import type { EncryptedPayload, EncryptionService } from "./encryption.js";

export async function storeSecret(
  db: RackoraDatabase,
  encryption: EncryptionService,
  key: string,
  plaintext: string,
): Promise<void> {
  const payload = encryption.encrypt(plaintext);
  const now = new Date();
  const existing = await db.query.encryptedSecrets.findFirst({
    where: eq(encryptedSecrets.key, key),
  });

  if (existing) {
    await db
      .update(encryptedSecrets)
      .set({
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        authTag: payload.authTag,
        updatedAt: now,
      })
      .where(eq(encryptedSecrets.key, key));
    return;
  }

  await db.insert(encryptedSecrets).values({
    id: randomUUID(),
    key,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    authTag: payload.authTag,
    createdAt: now,
    updatedAt: now,
  });
}

export async function readSecret(
  db: RackoraDatabase,
  encryption: EncryptionService,
  key: string,
): Promise<string | null> {
  const record = await db.query.encryptedSecrets.findFirst({
    where: eq(encryptedSecrets.key, key),
  });

  if (!record) {
    return null;
  }

  const payload: EncryptedPayload = {
    ciphertext: record.ciphertext,
    iv: record.iv,
    authTag: record.authTag,
  };

  return encryption.decrypt(payload);
}

export async function deleteSecret(
  db: RackoraDatabase,
  key: string,
): Promise<void> {
  await db.delete(encryptedSecrets).where(eq(encryptedSecrets.key, key));
}
