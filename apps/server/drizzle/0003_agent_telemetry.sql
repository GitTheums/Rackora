CREATE TABLE `agent_telemetry_state` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`collected_at` integer NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_metric_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`collected_at` integer NOT NULL,
	`metric_key` text NOT NULL,
	`value` real NOT NULL,
	`labels_json` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
