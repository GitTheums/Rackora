import type { z } from "zod";
import type { ConnectionTestResult } from "@rackora/shared";

/**
 * Generic contract for a read-only integration. Secrets must never appear in
 * normalized output or redacted error messages.
 */
export interface IntegrationAdapter<TConfig, TRaw, TNormalized> {
  readonly type: string;
  /** Accept Zod schemas with defaults (input may be partial). */
  readonly configSchema: z.ZodType<TConfig, z.ZodTypeDef, unknown>;

  testConnection(config: TConfig): Promise<ConnectionTestResult>;
  collect(config: TConfig): Promise<TRaw>;
  normalize(raw: TRaw): TNormalized;
  redactError(error: unknown): string;
}
