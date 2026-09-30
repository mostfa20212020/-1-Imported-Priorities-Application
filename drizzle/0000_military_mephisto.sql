CREATE TABLE `file_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_id` int NOT NULL,
	`actor_name` text NOT NULL,
	`action_type` text NOT NULL,
	`old_status` varchar(64),
	`new_status` varchar(64),
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incoming_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_number` varchar(255) NOT NULL,
	`year` int NOT NULL,
	`arrival_date` timestamp NOT NULL,
	`source_entity` text NOT NULL,
	`file_type` varchar(255) NOT NULL,
	`subject` text NOT NULL,
	`importance` varchar(64) NOT NULL DEFAULT 'normal',
	`status` varchar(64) NOT NULL DEFAULT 'PENDING_AG',
	`original_file_key` text,
	`original_file_url` text,
	`original_file_name` text,
	`original_mime_type` varchar(128),
	`signed_file_key` text,
	`signed_file_url` text,
	`is_signed` boolean NOT NULL DEFAULT false,
	`signature_name` text,
	`signature_title` text,
	`signed_at` timestamp,
	`signed_instruction` text,
	`assigned_department` text,
	`assigned_employee` text,
	`director_instruction` text,
	`notes` text,
	`due_date` timestamp,
	`registered_by` text,
	`current_responsible` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`directed_at` timestamp,
	`completed_at` timestamp,
	CONSTRAINT `incoming_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipient_open_id` varchar(255),
	`recipient_role` varchar(64) NOT NULL DEFAULT 'director',
	`file_id` int,
	`kind` varchar(128) NOT NULL,
	`priority` varchar(64) NOT NULL DEFAULT 'normal',
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uid` varchar(255),
	`open_id` varchar(255) NOT NULL,
	`username` varchar(255),
	`password_hash` text,
	`name` text,
	`job_title` text,
	`email` varchar(255),
	`login_method` varchar(64),
	`role` varchar(64) NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_signed_in` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_uid_unique` UNIQUE(`uid`),
	CONSTRAINT `users_open_id_unique` UNIQUE(`open_id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `file_history` ADD CONSTRAINT `file_history_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_file_id_incoming_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `incoming_files`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `file_history_file_idx` ON `file_history` (`file_id`);--> statement-breakpoint
CREATE INDEX `incoming_files_status_idx` ON `incoming_files` (`status`);--> statement-breakpoint
CREATE INDEX `incoming_files_importance_idx` ON `incoming_files` (`importance`);--> statement-breakpoint
CREATE INDEX `incoming_files_arrival_idx` ON `incoming_files` (`arrival_date`);--> statement-breakpoint
CREATE INDEX `incoming_files_file_number_idx` ON `incoming_files` (`file_number`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_open_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_file_id_idx` ON `notifications` (`file_id`);