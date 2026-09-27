import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  openId: text('open_id').notNull().unique(),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  jobTitle: text('job_title'),
  email: text('email'),
  loginMethod: text('login_method'),
  role: text('role').default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastSignedIn: timestamp('last_signed_in').defaultNow().notNull(),
});

export const incomingFiles = pgTable('incoming_files', {
  id: serial('id').primaryKey(),
  fileNumber: text('file_number').notNull(),
  year: integer('year').notNull(),
  arrivalDate: timestamp('arrival_date').notNull(),
  sourceEntity: text('source_entity').notNull(),
  fileType: text('file_type').notNull(),
  subject: text('subject').notNull(),
  importance: text('importance').default('normal').notNull(),
  status: text('status').default('PENDING_AG').notNull(),
  originalFileKey: text('original_file_key'),
  originalFileUrl: text('original_file_url'),
  originalFileName: text('original_file_name'),
  originalMimeType: text('original_mime_type'),
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

export const fileHistory = pgTable('file_history', {
  id: serial('id').primaryKey(),
  fileId: integer('file_id').notNull(),
  actorName: text('actor_name').notNull(),
  actionType: text('action_type').notNull(),
  oldStatus: text('old_status'),
  newStatus: text('new_status'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('file_history_file_idx').on(table.fileId),
]);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientOpenId: text('recipient_open_id'),
  recipientRole: text('recipient_role').default('director').notNull(),
  fileId: integer('file_id'),
  kind: text('kind').notNull(),
  priority: text('priority').default('normal').notNull(),
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
