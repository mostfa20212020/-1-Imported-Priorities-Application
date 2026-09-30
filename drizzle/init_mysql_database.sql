-- =============================================================================
-- نظام إدارة الأوليات - النيابة العامة
-- MySQL Database Complete Schema (DDL)
-- المتوافق بنسبة 100% مع Drizzle ORM ونموذج src/db/schema.ts
-- يشمل: الجداول الأساسية، الأرشيف المحلي، إصدارات الـ PDF، سجل التدقيق، وعمليات الترحيل
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

-- -----------------------------------------------------------------------------
-- 5. جدول الأرشيف المحلي (archives)
-- يمثل المعاملة المكتملة المرحلة إلى الأرشيف المحلي
-- قيد Unique على file_id يمنع تكرار أرشفة المعاملة
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `archives` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `file_id` INT NOT NULL,
  `file_number` VARCHAR(255) NOT NULL,
  `archived_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_by` VARCHAR(255) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'ARCHIVED',
  `current_pdf_version` INT NOT NULL DEFAULT 1,
  `original_pdf_version` INT NOT NULL DEFAULT 1,
  `original_pdf_hash` VARCHAR(128) NULL,
  `current_pdf_hash` VARCHAR(128) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `archives_id` PRIMARY KEY (`id`),
  CONSTRAINT `archives_file_id_unique` UNIQUE (`file_id`),
  INDEX `archives_file_id_idx` (`file_id`),
  INDEX `archives_file_number_idx` (`file_number`),
  INDEX `archives_status_idx` (`status`),
  INDEX `archives_archived_at_idx` (`archived_at`),
  CONSTRAINT `archives_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. جدول إصدارات ملفات الـ PDF (pdf_versions)
-- Version 1 = النسخة الرسمية الأولى المعتمدة عند الترحيل
-- الإصدارات اللاحقة تحفظ أي تعديلات إدارية دون حذف النسخ السابقة
-- قيد Unique على (archive_id, version_number) يمنع تكرار رقم الإصدار
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pdf_versions` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `archive_id` INT NOT NULL,
  `file_id` INT NOT NULL,
  `version_number` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` TEXT NULL,
  `file_size` INT NULL,
  `file_hash` VARCHAR(128) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reason` TEXT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
  `is_current` BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT `pdf_versions_id` PRIMARY KEY (`id`),
  CONSTRAINT `pdf_versions_archive_version_unique` UNIQUE (`archive_id`, `version_number`),
  INDEX `pdf_versions_archive_id_idx` (`archive_id`),
  INDEX `pdf_versions_file_id_idx` (`file_id`),
  INDEX `pdf_versions_file_hash_idx` (`file_hash`),
  CONSTRAINT `pdf_versions_archive_id_archives_id_fk`
    FOREIGN KEY (`archive_id`) REFERENCES `archives` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pdf_versions_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. جدول سجل التدقيق والمراجعة الشامل (audit_logs)
-- يسجل كافة التعديلات على البيانات حقلاً بحقل
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `archive_id` INT NULL,
  `file_id` INT NULL,
  `user_id` INT NULL,
  `username` VARCHAR(255) NULL,
  `action` VARCHAR(64) NOT NULL,
  `table_name` VARCHAR(128) NOT NULL,
  `record_id` VARCHAR(128) NOT NULL,
  `field_name` VARCHAR(128) NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `ip_address` VARCHAR(64) NULL,
  `device_info` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `audit_logs_id` PRIMARY KEY (`id`),
  INDEX `audit_logs_archive_id_idx` (`archive_id`),
  INDEX `audit_logs_file_id_idx` (`file_id`),
  INDEX `audit_logs_user_id_idx` (`user_id`),
  INDEX `audit_logs_table_record_idx` (`table_name`, `record_id`),
  INDEX `audit_logs_created_at_idx` (`created_at`),
  CONSTRAINT `audit_logs_archive_id_archives_id_fk`
    FOREIGN KEY (`archive_id`) REFERENCES `archives` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. جدول عمليات الترحيل السحابي إلى المحلي (archive_transfers)
-- يسجل محاولات الترحيل والتأكيد وحالات الإخفاق وإعادة المحاولة
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `archive_transfers` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `file_id` INT NOT NULL,
  `archive_id` INT NULL,
  `transfer_status` VARCHAR(64) NOT NULL DEFAULT 'PENDING',
  `started_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `error_message` TEXT NULL,
  `source_reference` VARCHAR(255) NOT NULL DEFAULT 'cloud_firestore',
  `destination_reference` VARCHAR(255) NOT NULL DEFAULT 'local_mysql',
  `payload_hash` VARCHAR(128) NULL,
  `pdf_hash` VARCHAR(128) NULL,
  `last_attempt_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `archive_transfers_id` PRIMARY KEY (`id`),
  INDEX `archive_transfers_file_id_idx` (`file_id`),
  INDEX `archive_transfers_archive_id_idx` (`archive_id`),
  INDEX `archive_transfers_status_idx` (`transfer_status`),
  CONSTRAINT `archive_transfers_file_id_incoming_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `incoming_files` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `archive_transfers_archive_id_archives_id_fk`
    FOREIGN KEY (`archive_id`) REFERENCES `archives` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
