import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const credentialsSchema = z.object({
  agentId: z.string().uuid(),
  secret: z.string().min(1),
  name: z.string().min(1),
  coreUrl: z.string().url(),
});

export type AgentCredentials = z.infer<typeof credentialsSchema>;

export function credentialsPath(dataDir: string): string {
  return path.join(dataDir, "credentials.json");
}

export function loadCredentials(dataDir: string): AgentCredentials | null {
  const filePath = credentialsPath(dataDir);
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = readFileSync(filePath, "utf8");
  return credentialsSchema.parse(JSON.parse(raw) as unknown);
}

export function saveCredentials(
  dataDir: string,
  credentials: AgentCredentials,
): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filePath = credentialsPath(dataDir);
  writeFileSync(filePath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}
