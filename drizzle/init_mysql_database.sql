-- =============================================================================
-- نظام إدارة الأوليات - النيابة العامة
-- MySQL Database Initial Schema (DDL)
-- المتوافق بنسبة 100% مع Drizzle ORM ونموذج src/db/schema.ts
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. جدول المستخدمين (users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `uid` VARCHAR(255) NULL,
  `open_id` VARCHAR(255) NOT NULL,
  `username` VARCHAR(255) NULL,
  `password_hash` TEXT NULL,
  `name` TEXT NULL,
  `job_title` TEXT NULL,
  `email` VARCHAR(255) NULL,
  `login_method` VARCHAR(64) NULL,
  `role` VARCHAR(64) NOT NULL DEFAULT 'user',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_signed_in` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `users_id` PRIMARY KEY (`id`),
  CONSTRAINT `users_uid_unique` UNIQUE (`uid`),
  CONSTRAINT `users_open_id_unique` UNIQUE (`open_id`),
  CONSTRAINT `users_username_unique` UNIQUE (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. جدول الأوليات والملفات الواردة (incoming_files)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `incoming_files` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `file_number` VARCHAR(255) NOT NULL,
  `year` INT NOT NULL,
  `arrival_date` TIMESTAMP NOT NULL,
  `source_entity` TEXT NOT NULL,
  `file_type` VARCHAR(255) NOT NULL,
  `subject` TEXT NOT NULL,
  `importance` VARCHAR(64) NOT NULL DEFAULT 'normal',
  `status` VARCHAR(64) NOT NULL DEFAULT 'PENDING_AG',
  `original_file_key` TEXT NULL,
  `original_file_url` TEXT NULL,
  `original_file_name` TEXT NULL,
  `original_mime_type` VARCHAR(128) NULL,
  `signed_file_key` TEXT NULL,
  `signed_file_url` TEXT NULL,
  `is_signed` BOOLEAN NOT NULL DEFAULT FALSE,
  `signature_name` TEXT NULL,
  `signature_title` TEXT NULL,
  `signed_at` TIMESTAMP NULL,
  `signed_instruction` TEXT NULL,
  `assigned_department` TEXT NULL,
  `assigned_employee` TEXT NULL,
  `director_instruction` TEXT NULL,
  `notes` TEXT NULL,
  `due_date` TIMESTAMP NULL,
  `registered_by` TEXT NULL,
  `current_responsible` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `directed_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  CONSTRAINT `incoming_files_id` PRIMARY KEY (`id`),
  INDEX `incoming_files_status_idx` (`status`),
  INDEX `incoming_files_importance_idx` (`importance`),
  INDEX `incoming_files_arrival_idx` (`arrival_date`),
  INDEX `incoming_files_file_number_idx` (`file_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. جدول سجل حركات وتوجيهات الأوليات (file_history)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `file_history` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `file_id` INT NOT NULL,
  `actor_name` TEXT NOT NULL,
  `action_type` TEXT NOT NULL,
  `old_status` VARCHAR(64) NULL,
  `new_status` VARCHAR(64) NULL,
  `details` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `file_history_id` PRIMARY KEY (`id`),
  INDEX `file_history_file_idx` (`file_id`),
  CONSTRAINT `file_history_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. جدول الإشعارات والتنبيهات (notifications)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `recipient_open_id` VARCHAR(255) NULL,
  `recipient_role` VARCHAR(64) NOT NULL DEFAULT 'director',
  `file_id` INT NULL,
  `kind` VARCHAR(128) NOT NULL,
  `priority` VARCHAR(64) NOT NULL DEFAULT 'normal',
  `title` TEXT NOT NULL,
  `body` TEXT NOT NULL,
  `read_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `notifications_id` PRIMARY KEY (`id`),
  INDEX `notifications_recipient_idx` (`recipient_open_id`),
  INDEX `notifications_read_idx` (`read_at`),
  INDEX `notifications_file_id_idx` (`file_id`),
  CONSTRAINT `notifications_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
