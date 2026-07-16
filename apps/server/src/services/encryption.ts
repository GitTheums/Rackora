import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export class EncryptionService {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error("Encryption key must be exactly 32 bytes.");
    }
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}
