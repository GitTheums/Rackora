import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
