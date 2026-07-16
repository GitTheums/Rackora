CREATE TABLE `enrollment_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_tokens_token_hash_unique` ON `enrollment_tokens` (`token_hash`);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`secret_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`enrollment_token_id` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`enrollment_token_id`) REFERENCES `enrollment_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_secret_key_unique` ON `agents` (`secret_key`);
--> statement-breakpoint
CREATE TABLE `agent_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`nonce` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_nonces_agent_id_nonce_unique` ON `agent_nonces` (`agent_id`,`nonce`);
--> statement-breakpoint
CREATE TABLE `agent_heartbeats` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`status` text NOT NULL,
	`payload_json` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
