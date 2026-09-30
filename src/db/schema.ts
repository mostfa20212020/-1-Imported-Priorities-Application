import { relations } from 'drizzle-orm';
import { boolean, index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

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
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastSignedIn: timestamp('last_signed_in').defaultNow().notNull(),
});

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
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  directedAt: timestamp('directed_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('incoming_files_status_idx').on(table.status),
  index('incoming_files_importance_idx').on(table.importance),
  index('incoming_files_arrival_idx').on(table.arrivalDate),
]);

export const fileHistory = mysqlTable('file_history', {
  id: int('id').autoincrement().primaryKey(),
  fileId: int('file_id').notNull(),
  actorName: text('actor_name').notNull(),
  actionType: text('action_type').notNull(),
  oldStatus: varchar('old_status', { length: 64 }),
  newStatus: varchar('new_status', { length: 64 }),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('file_history_file_idx').on(table.fileId),
]);

export const notifications = mysqlTable('notifications', {
  id: int('id').autoincrement().primaryKey(),
  recipientOpenId: varchar('recipient_open_id', { length: 255 }),
  recipientRole: varchar('recipient_role', { length: 64 }).default('director').notNull(),
  fileId: int('file_id'),
  kind: varchar('kind', { length: 128 }).notNull(),
  priority: varchar('priority', { length: 64 }).default('normal').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('notifications_recipient_idx').on(table.recipientOpenId),
  index('notifications_read_idx').on(table.readAt),
]);

export const fileHistoryRelations = relations(fileHistory, ({ one }) => ({
  file: one(incomingFiles, {
    fields: [fileHistory.fileId],
    references: [incomingFiles.id],
  }),
}));

export const incomingFilesRelations = relations(incomingFiles, ({ many }) => ({
  history: many(fileHistory),
  notifications: many(notifications),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type IncomingFile = typeof incomingFiles.$inferSelect;
export type InsertIncomingFile = typeof incomingFiles.$inferInsert;
export type FileHistory = typeof fileHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
