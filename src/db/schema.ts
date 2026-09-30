import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  int,
  mysqlTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';

// =============================================================================
// 1. جدول المستخدمين (users)
// =============================================================================
export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  uid: varchar('uid', { length: 255 }).unique(),
  openId: varchar('open_id', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  jobTitle: text('job_title'),
  email: varchar('email', { length: 255 }),
  loginMethod: varchar('login_method', { length: 64 }),
  role: varchar('role', { length: 64 }).default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp('last_signed_in').defaultNow().notNull(),
});

// =============================================================================
// 2. جدول الأوليات والملفات الواردة (incoming_files)
// =============================================================================
export const incomingFiles = mysqlTable('incoming_files', {
  id: int('id').autoincrement().primaryKey(),
  fileNumber: varchar('file_number', { length: 255 }).notNull(),
  year: int('year').notNull(),
  arrivalDate: timestamp('arrival_date').notNull(),
  sourceEntity: text('source_entity').notNull(),
  fileType: varchar('file_type', { length: 255 }).notNull(),
  subject: text('subject').notNull(),
  importance: varchar('importance', { length: 64 }).default('normal').notNull(),
  status: varchar('status', { length: 64 }).default('PENDING_AG').notNull(),
  originalFileKey: text('original_file_key'),
  originalFileUrl: text('original_file_url'),
  originalFileName: text('original_file_name'),
  originalMimeType: varchar('original_mime_type', { length: 128 }),
  signedFileKey: text('signed_file_key'),
  signedFileUrl: text('signed_file_url'),
  isSigned: boolean('is_signed').default(false).notNull(),
  signatureName: text('signature_name'),
  signatureTitle: text('signature_title'),
  signedAt: timestamp('signed_at'),
  signedInstruction: text('signed_instruction'),
  assignedDepartment: text('assigned_department'),
  assignedEmployee: text('assigned_employee'),
  directorInstruction: text('director_instruction'),
  notes: text('notes'),
  dueDate: timestamp('due_date'),
  registeredBy: text('registered_by'),
  currentResponsible: text('current_responsible'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  directedAt: timestamp('directed_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('incoming_files_status_idx').on(table.status),
  index('incoming_files_importance_idx').on(table.importance),
  index('incoming_files_arrival_idx').on(table.arrivalDate),
  index('incoming_files_file_number_idx').on(table.fileNumber),
]);

// =============================================================================
// 3. جدول سجل حركات وتوجيهات الأوليات (file_history)
// =============================================================================
export const fileHistory = mysqlTable('file_history', {
  id: int('id').autoincrement().primaryKey(),
  fileId: int('file_id')
    .notNull()
    .references(() => incomingFiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  actorName: text('actor_name').notNull(),
  actionType: text('action_type').notNull(),
  oldStatus: varchar('old_status', { length: 64 }),
  newStatus: varchar('new_status', { length: 64 }),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('file_history_file_idx').on(table.fileId),
]);

// =============================================================================
// 4. جدول الإشعارات والتنبيهات (notifications)
// =============================================================================
export const notifications = mysqlTable('notifications', {
  id: int('id').autoincrement().primaryKey(),
  recipientOpenId: varchar('recipient_open_id', { length: 255 }),
  recipientRole: varchar('recipient_role', { length: 64 }).default('director').notNull(),
  fileId: int('file_id').references(() => incomingFiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  kind: varchar('kind', { length: 128 }).notNull(),
  priority: varchar('priority', { length: 64 }).default('normal').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('notifications_recipient_idx').on(table.recipientOpenId),
  index('notifications_read_idx').on(table.readAt),
  index('notifications_file_id_idx').on(table.fileId),
]);

// =============================================================================
// 5. جدول الأرشيف المحلي (archives)
// يمثل المعاملة المكتملة التي تم ترحيلها إلى الأرشيف المحلي
// قيد Unique على file_id يمنع نهائياً تكرار ترحيل نفس المعاملة
// =============================================================================
export const archives = mysqlTable('archives', {
  id: int('id').autoincrement().primaryKey(),
  fileId: int('file_id')
    .notNull()
    .unique()
    .references(() => incomingFiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  fileNumber: varchar('file_number', { length: 255 }).notNull(),
  archivedAt: timestamp('archived_at').defaultNow().notNull(),
  archivedBy: varchar('archived_by', { length: 255 }).notNull(),
  status: varchar('status', { length: 64 }).default('ARCHIVED').notNull(),
  currentPdfVersion: int('current_pdf_version').default(1).notNull(),
  originalPdfVersion: int('original_pdf_version').default(1).notNull(),
  originalPdfHash: varchar('original_pdf_hash', { length: 128 }),
  currentPdfHash: varchar('current_pdf_hash', { length: 128 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index('archives_file_id_idx').on(table.fileId),
  index('archives_file_number_idx').on(table.fileNumber),
  index('archives_status_idx').on(table.status),
  index('archives_archived_at_idx').on(table.archivedAt),
]);

// =============================================================================
// 6. جدول إصدارات ملفات الـ PDF (pdf_versions)
// Version 1 = PDF الرسمي المعتمد والموقع عند الترحيل الأول
// Version 2+ = الإصدارات الناتجة عن أي تعديل لاحق من قبل المشرف مع الاحتفاظ بالقديم
// قيد Unique على (archive_id, version_number) يمنع إنشاء نفس رقم الإصدار مرتين
// =============================================================================
export const pdfVersions = mysqlTable('pdf_versions', {
  id: int('id').autoincrement().primaryKey(),
  archiveId: int('archive_id')
    .notNull()
    .references(() => archives.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  fileId: int('file_id')
    .notNull()
    .references(() => incomingFiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  versionNumber: int('version_number').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  mimeType: varchar('mime_type', { length: 128 }).default('application/pdf').notNull(),
  fileSize: int('file_size').notNull(),
  fileHash: varchar('file_hash', { length: 128 }).notNull(),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 64 }).default('ACTIVE').notNull(),
  isCurrent: boolean('is_current').default(false).notNull(),
}, (table) => [
  unique('pdf_versions_archive_version_unique').on(table.archiveId, table.versionNumber),
  index('pdf_versions_archive_id_idx').on(table.archiveId),
  index('pdf_versions_file_id_idx').on(table.fileId),
  index('pdf_versions_file_hash_idx').on(table.fileHash),
]);

// =============================================================================
// 7. جدول سجل التدقيق والمراجعة الشامل (audit_logs)
// يسجل جميع تعديلات البيانات حقلاً بحقل مع القيمة القديمة والجديدة ومعلومات الجهاز
// =============================================================================
export const auditLogs = mysqlTable('audit_logs', {
  id: int('id').autoincrement().primaryKey(),
  archiveId: int('archive_id').references(() => archives.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  fileId: int('file_id').references(() => incomingFiles.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  userId: int('user_id').references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  username: varchar('username', { length: 255 }),
  action: varchar('action', { length: 64 }).notNull(),
  tableName: varchar('table_name', { length: 128 }).notNull(),
  recordId: varchar('record_id', { length: 128 }).notNull(),
  fieldName: varchar('field_name', { length: 128 }),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  ipAddress: varchar('ip_address', { length: 64 }),
  deviceInfo: text('device_info'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('audit_logs_archive_id_idx').on(table.archiveId),
  index('audit_logs_file_id_idx').on(table.fileId),
  index('audit_logs_user_id_idx').on(table.userId),
  index('audit_logs_table_record_idx').on(table.tableName, table.recordId),
  index('audit_logs_created_at_idx').on(table.createdAt),
]);

// =============================================================================
// 8. جدول عمليات الترحيل السحابي إلى المحلي (archive_transfers)
// يسجل عمليات نقل المعاملات من Cloud إلى MySQL المحلية وحالات الإعادة والتأكيد
// =============================================================================
export const archiveTransfers = mysqlTable('archive_transfers', {
  id: int('id').autoincrement().primaryKey(),
  fileId: int('file_id')
    .notNull()
    .references(() => incomingFiles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  archiveId: int('archive_id').references(() => archives.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  transferStatus: varchar('transfer_status', { length: 64 }).default('PENDING').notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  attemptCount: int('attempt_count').default(0).notNull(),
  errorMessage: text('error_message'),
  sourceReference: varchar('source_reference', { length: 255 }).default('cloud_firestore').notNull(),
  destinationReference: varchar('destination_reference', { length: 255 }).default('local_mysql').notNull(),
  payloadHash: varchar('payload_hash', { length: 128 }),
  pdfHash: varchar('pdf_hash', { length: 128 }),
  lastAttemptAt: timestamp('last_attempt_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index('archive_transfers_file_id_idx').on(table.fileId),
  index('archive_transfers_archive_id_idx').on(table.archiveId),
  index('archive_transfers_status_idx').on(table.transferStatus),
]);

// =============================================================================
// علاقات Drizzle ORM بين الجداول
// =============================================================================
export const fileHistoryRelations = relations(fileHistory, ({ one }) => ({
  file: one(incomingFiles, {
    fields: [fileHistory.fileId],
    references: [incomingFiles.id],
  }),
}));

export const incomingFilesRelations = relations(incomingFiles, ({ one, many }) => ({
  history: many(fileHistory),
  notifications: many(notifications),
  archive: one(archives, {
    fields: [incomingFiles.id],
    references: [archives.fileId],
  }),
  pdfVersions: many(pdfVersions),
  transfers: many(archiveTransfers),
  auditLogs: many(auditLogs),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  file: one(incomingFiles, {
    fields: [notifications.fileId],
    references: [incomingFiles.id],
  }),
  recipient: one(users, {
    fields: [notifications.recipientOpenId],
    references: [users.openId],
  }),
}));

export const archivesRelations = relations(archives, ({ one, many }) => ({
  file: one(incomingFiles, {
    fields: [archives.fileId],
    references: [incomingFiles.id],
  }),
  pdfVersions: many(pdfVersions),
  transfers: many(archiveTransfers),
  auditLogs: many(auditLogs),
}));

export const pdfVersionsRelations = relations(pdfVersions, ({ one }) => ({
  archive: one(archives, {
    fields: [pdfVersions.archiveId],
    references: [archives.id],
  }),
  file: one(incomingFiles, {
    fields: [pdfVersions.fileId],
    references: [incomingFiles.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  archive: one(archives, {
    fields: [auditLogs.archiveId],
    references: [archives.id],
  }),
  file: one(incomingFiles, {
    fields: [auditLogs.fileId],
    references: [incomingFiles.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const archiveTransfersRelations = relations(archiveTransfers, ({ one }) => ({
  file: one(incomingFiles, {
    fields: [archiveTransfers.fileId],
    references: [incomingFiles.id],
  }),
  archive: one(archives, {
    fields: [archiveTransfers.archiveId],
    references: [archives.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

// =============================================================================
// أنواع البيانات المصدرة (TypeScript Types)
// =============================================================================
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type IncomingFile = typeof incomingFiles.$inferSelect;
export type InsertIncomingFile = typeof incomingFiles.$inferInsert;
export type FileHistory = typeof fileHistory.$inferSelect;
export type InsertFileHistory = typeof fileHistory.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type Archive = typeof archives.$inferSelect;
export type InsertArchive = typeof archives.$inferInsert;
export type PdfVersion = typeof pdfVersions.$inferSelect;
export type InsertPdfVersion = typeof pdfVersions.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type ArchiveTransfer = typeof archiveTransfers.$inferSelect;
export type InsertArchiveTransfer = typeof archiveTransfers.$inferInsert;
