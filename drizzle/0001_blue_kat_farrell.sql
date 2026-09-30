CREATE TABLE `archive_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_id` int NOT NULL,
	`archive_id` int,
	`transfer_status` varchar(64) NOT NULL DEFAULT 'PENDING',
	`started_at` timestamp,
	`completed_at` timestamp,
	`attempt_count` int NOT NULL DEFAULT 0,
	`error_message` text,
	`source_reference` varchar(255) NOT NULL DEFAULT 'cloud_firestore',
	`destination_reference` varchar(255) NOT NULL DEFAULT 'local_mysql',
	`payload_hash` varchar(128),
	`pdf_hash` varchar(128),
	`last_attempt_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `archive_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `archives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_id` int NOT NULL,
	`file_number` varchar(255) NOT NULL,
	`archived_at` timestamp NOT NULL DEFAULT (now()),
	`archived_by` varchar(255) NOT NULL,
	`status` varchar(64) NOT NULL DEFAULT 'ARCHIVED',
	`current_pdf_version` int NOT NULL DEFAULT 1,
	`original_pdf_version` int NOT NULL DEFAULT 1,
	`original_pdf_hash` varchar(128),
	`current_pdf_hash` varchar(128),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `archives_id` PRIMARY KEY(`id`),
	CONSTRAINT `archives_file_id_unique` UNIQUE(`file_id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`archive_id` int,
	`file_id` int,
	`user_id` int,
	`username` varchar(255),
	`action` varchar(64) NOT NULL,
	`table_name` varchar(128) NOT NULL,
	`record_id` varchar(128) NOT NULL,
	`field_name` varchar(128),
	`old_value` text,
	`new_value` text,
	`ip_address` varchar(64),
	`device_info` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdf_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`archive_id` int NOT NULL,
	`file_id` int NOT NULL,
	`version_number` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_path` text,
	`file_size` int,
	`file_hash` varchar(128) NOT NULL,
	`created_by` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reason` text,
	`status` varchar(64) NOT NULL DEFAULT 'ACTIVE',
	`is_current` boolean NOT NULL DEFAULT false,
	CONSTRAINT `pdf_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pdf_versions_archive_version_unique` UNIQUE(`archive_id`,`version_number`)
);
--> statement-breakpoint
ALTER TABLE `archive_transfers` ADD CONSTRAINT `archive_transfers_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `archive_transfers` ADD CONSTRAINT `archive_transfers_archive_id_archives_id_fk` FOREIGN KEY (`archive_id`) REFERENCES `archives`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `archives` ADD CONSTRAINT `archives_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_archive_id_archives_id_fk` FOREIGN KEY (`archive_id`) REFERENCES `archives`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_versions` ADD CONSTRAINT `pdf_versions_archive_id_archives_id_fk` FOREIGN KEY (`archive_id`) REFERENCES `archives`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_versions` ADD CONSTRAINT `pdf_versions_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `archive_transfers_file_id_idx` ON `archive_transfers` (`file_id`);--> statement-breakpoint
CREATE INDEX `archive_transfers_archive_id_idx` ON `archive_transfers` (`archive_id`);--> statement-breakpoint
CREATE INDEX `archive_transfers_status_idx` ON `archive_transfers` (`transfer_status`);--> statement-breakpoint
CREATE INDEX `archives_file_id_idx` ON `archives` (`file_id`);--> statement-breakpoint
CREATE INDEX `archives_file_number_idx` ON `archives` (`file_number`);--> statement-breakpoint
CREATE INDEX `archives_status_idx` ON `archives` (`status`);--> statement-breakpoint
CREATE INDEX `archives_archived_at_idx` ON `archives` (`archived_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_archive_id_idx` ON `audit_logs` (`archive_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_file_id_idx` ON `audit_logs` (`file_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_table_record_idx` ON `audit_logs` (`table_name`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `pdf_versions_archive_id_idx` ON `pdf_versions` (`archive_id`);--> statement-breakpoint
CREATE INDEX `pdf_versions_file_id_idx` ON `pdf_versions` (`file_id`);--> statement-breakpoint
CREATE INDEX `pdf_versions_file_hash_idx` ON `pdf_versions` (`file_hash`);