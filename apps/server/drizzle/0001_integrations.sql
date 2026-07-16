CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config_json` text NOT NULL,
	`secret_key` text NOT NULL,
	`health_status` text DEFAULT 'unknown' NOT NULL,
	`last_success_at` integer,
	`last_error_at` integer,
	`last_error` text,
	`poll_interval_ms` integer DEFAULT 60000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_secret_key_unique` ON `integrations` (`secret_key`);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`collected_at` integer NOT NULL,
	`status` text NOT NULL,
	`payload_json` text,
	`error_message` text,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade
);
