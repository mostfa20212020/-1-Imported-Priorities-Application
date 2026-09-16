CREATE TABLE `file_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`actorName` varchar(255) NOT NULL,
	`actionType` varchar(128) NOT NULL,
	`oldStatus` varchar(64),
	`newStatus` varchar(64),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incoming_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileNumber` varchar(64) NOT NULL,
	`year` int NOT NULL,
	`arrivalDate` timestamp NOT NULL,
	`sourceEntity` varchar(255) NOT NULL,
	`fileType` varchar(128) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`importance` enum('normal','important','urgent') NOT NULL DEFAULT 'normal',
	`status` enum('new','awaiting_direction','directed','in_progress','returned','completed','archived') NOT NULL DEFAULT 'new',
	`originalFileKey` text,
	`originalFileUrl` text,
	`originalFileName` varchar(255),
	`originalMimeType` varchar(128),
	`signedFileKey` text,
	`signedFileUrl` text,
	`isSigned` boolean NOT NULL DEFAULT false,
	`signatureName` varchar(255),
	`signatureTitle` varchar(255),
	`signedAt` timestamp,
	`signedInstruction` text,
	`assignedDepartment` varchar(255),
	`assignedEmployee` varchar(255),
	`directorInstruction` text,
	`notes` text,
	`dueDate` timestamp,
	`registeredBy` varchar(255),
	`currentResponsible` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`directedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `incoming_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientOpenId` varchar(128),
	`recipientRole` varchar(64) NOT NULL DEFAULT 'director',
	`fileId` int,
	`kind` varchar(64) NOT NULL,
	`priority` enum('normal','important','urgent') NOT NULL DEFAULT 'normal',
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `file_history_file_idx` ON `file_history` (`fileId`);--> statement-breakpoint
CREATE INDEX `incoming_files_status_idx` ON `incoming_files` (`status`);--> statement-breakpoint
CREATE INDEX `incoming_files_importance_idx` ON `incoming_files` (`importance`);--> statement-breakpoint
CREATE INDEX `incoming_files_arrival_idx` ON `incoming_files` (`arrivalDate`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipientOpenId`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`readAt`);