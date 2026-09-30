ALTER TABLE `pdf_versions` MODIFY COLUMN `file_path` text NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_versions` MODIFY COLUMN `file_size` int NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_versions` ADD `mime_type` varchar(128) DEFAULT 'application/pdf' NOT NULL;