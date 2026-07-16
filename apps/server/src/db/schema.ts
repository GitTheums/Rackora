import { relations } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const encryptedSecrets = sqliteTable("encrypted_secrets", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** JSON config without secrets. */
  configJson: text("config_json").notNull(),
  /** Key into encrypted_secrets for the token secret. */
  secretKey: text("secret_key").notNull().unique(),
  healthStatus: text("health_status").notNull().default("unknown"),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
  lastErrorAt: integer("last_error_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  pollIntervalMs: integer("poll_interval_ms").notNull().default(60_000),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  integrationId: text("integration_id")
    .notNull()
    .references(() => integrations.id, { onDelete: "cascade" }),
  collectedAt: integer("collected_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull(),
  payloadJson: text("payload_json"),
  errorMessage: text("error_message"),
});

export const enrollmentTokens = sqliteTable("enrollment_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Key into encrypted_secrets for the agent HMAC secret. */
  secretKey: text("secret_key").notNull().unique(),
  status: text("status").notNull().default("active"),
  enrollmentTokenId: text("enrollment_token_id").references(
    () => enrollmentTokens.id,
    { onDelete: "set null" },
  ),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

export const agentNonces = sqliteTable(
  "agent_nonces",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("agent_nonces_agent_id_nonce_unique").on(
      table.agentId,
      table.nonce,
    ),
  ],
);

export const agentHeartbeats = sqliteTable("agent_heartbeats", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull(),
  payloadJson: text("payload_json"),
});

/** Latest telemetry snapshot per agent (upserted on each heartbeat). */
export const agentTelemetryState = sqliteTable("agent_telemetry_state", {
  agentId: text("agent_id")
    .primaryKey()
    .references(() => agents.id, { onDelete: "cascade" }),
  schemaVersion: integer("schema_version").notNull(),
  collectedAt: integer("collected_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull(),
  payloadJson: text("payload_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Time-series metric samples extracted from agent telemetry. */
export const agentMetricSamples = sqliteTable("agent_metric_samples", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  collectedAt: integer("collected_at", { mode: "timestamp_ms" }).notNull(),
  metricKey: text("metric_key").notNull(),
  value: real("value").notNull(),
  labelsJson: text("labels_json"),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ many }) => ({
  snapshots: many(snapshots),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  integration: one(integrations, {
    fields: [snapshots.integrationId],
    references: [integrations.id],
  }),
}));

export const enrollmentTokensRelations = relations(
  enrollmentTokens,
  ({ many }) => ({
    agents: many(agents),
  }),
);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  enrollmentToken: one(enrollmentTokens, {
    fields: [agents.enrollmentTokenId],
    references: [enrollmentTokens.id],
  }),
  nonces: many(agentNonces),
  heartbeats: many(agentHeartbeats),
  telemetryState: one(agentTelemetryState, {
    fields: [agents.id],
    references: [agentTelemetryState.agentId],
  }),
  metricSamples: many(agentMetricSamples),
}));

export const agentTelemetryStateRelations = relations(
  agentTelemetryState,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentTelemetryState.agentId],
      references: [agents.id],
    }),
  }),
);

export const agentMetricSamplesRelations = relations(
  agentMetricSamples,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentMetricSamples.agentId],
      references: [agents.id],
    }),
  }),
);

export const agentNoncesRelations = relations(agentNonces, ({ one }) => ({
  agent: one(agents, {
    fields: [agentNonces.agentId],
    references: [agents.id],
  }),
}));

export const agentHeartbeatsRelations = relations(
  agentHeartbeats,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentHeartbeats.agentId],
      references: [agents.id],
    }),
  }),
);
