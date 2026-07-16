import { z } from "zod";
import { serviceStateSchema } from "./dashboard.js";

export const integrationTypeSchema = z.enum(["proxmox"]);
export type IntegrationType = z.infer<typeof integrationTypeSchema>;

export const tlsModeSchema = z.enum(["verify", "insecure", "custom-ca"]);
export type TlsMode = z.infer<typeof tlsModeSchema>;

/** Public Proxmox config (never includes the token secret). */
export const proxmoxPublicConfigSchema = z.object({
  baseUrl: z.string().url(),
  tokenId: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^[^@\s]+@[^!\s]+![^\s]+$/, "Expected user@realm!token-name"),
  tlsMode: tlsModeSchema.default("verify"),
  customCa: z.string().max(64_000).optional(),
});
export type ProxmoxPublicConfig = z.infer<typeof proxmoxPublicConfigSchema>;

/** Full Proxmox config including the secret (API input only). */
export const proxmoxConfigSchema = proxmoxPublicConfigSchema.extend({
  tokenSecret: z.string().min(1).max(256),
});
export type ProxmoxConfig = z.infer<typeof proxmoxConfigSchema>;

export const createProxmoxIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(64),
  enabled: z.boolean().default(true),
  pollIntervalMs: z
    .number()
    .int()
    .min(15_000)
    .max(3_600_000)
    .default(60_000),
  config: proxmoxConfigSchema,
});
export type CreateProxmoxIntegration = z.infer<
  typeof createProxmoxIntegrationSchema
>;

export const updateProxmoxIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  pollIntervalMs: z.number().int().min(15_000).max(3_600_000).optional(),
  config: proxmoxConfigSchema
    .partial()
    .extend({
      // Secret may be omitted on update to keep the existing encrypted value.
      tokenSecret: z.string().min(1).max(256).optional(),
      baseUrl: z.string().url().optional(),
      tokenId: z
        .string()
        .trim()
        .min(3)
        .max(128)
        .regex(/^[^@\s]+@[^!\s]+![^\s]+$/)
        .optional(),
    })
    .optional(),
});
export type UpdateProxmoxIntegration = z.infer<
  typeof updateProxmoxIntegrationSchema
>;

export const testProxmoxConnectionSchema = proxmoxConfigSchema;
export type TestProxmoxConnection = z.infer<typeof testProxmoxConnectionSchema>;

export const connectionTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  version: z.string().optional(),
  release: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;

export const integrationRecordSchema = z.object({
  id: z.string().uuid(),
  type: integrationTypeSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  config: proxmoxPublicConfigSchema,
  healthStatus: serviceStateSchema,
  lastSuccessAt: z.string().datetime().nullable(),
  lastErrorAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  pollIntervalMs: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  hasSecret: z.boolean(),
});
export type IntegrationRecord = z.infer<typeof integrationRecordSchema>;

export const integrationListResponseSchema = z.object({
  integrations: z.array(integrationRecordSchema),
});
export type IntegrationListResponse = z.infer<
  typeof integrationListResponseSchema
>;

export const integrationResponseSchema = z.object({
  integration: integrationRecordSchema,
});
export type IntegrationResponse = z.infer<typeof integrationResponseSchema>;
