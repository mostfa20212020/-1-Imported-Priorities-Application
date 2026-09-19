import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "input", "director"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const incomingFiles = mysqlTable("incoming_files", {
  id: int("id").autoincrement().primaryKey(),
  fileNumber: varchar("fileNumber", { length: 64 }).notNull(),
  year: int("year").notNull(),
  arrivalDate: timestamp("arrivalDate").notNull(),
  sourceEntity: varchar("sourceEntity", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 128 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  importance: mysqlEnum("importance", ["normal", "important", "urgent"]).default("normal").notNull(),
  status: mysqlEnum("status", ["new", "awaiting_direction", "directed", "in_progress", "returned", "completed", "archived", "PENDING_AG", "PENDING_EMPLOYEE", "COMPLETED"]).default("PENDING_AG").notNull(),
  originalFileKey: text("originalFileKey"),
  originalFileUrl: text("originalFileUrl"),
  originalFileName: varchar("originalFileName", { length: 255 }),
  originalMimeType: varchar("originalMimeType", { length: 128 }),
  signedFileKey: text("signedFileKey"),
  signedFileUrl: text("signedFileUrl"),
  isSigned: boolean("isSigned").default(false).notNull(),
  signatureName: varchar("signatureName", { length: 255 }),
  signatureTitle: varchar("signatureTitle", { length: 255 }),
  signedAt: timestamp("signedAt"),
  signedInstruction: text("signedInstruction"),
  assignedDepartment: varchar("assignedDepartment", { length: 255 }),
  assignedEmployee: varchar("assignedEmployee", { length: 255 }),
  directorInstruction: text("directorInstruction"),
  notes: text("notes"),
  dueDate: timestamp("dueDate"),
  registeredBy: varchar("registeredBy", { length: 255 }),
  currentResponsible: varchar("currentResponsible", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  directedAt: timestamp("directedAt"),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  statusIdx: index("incoming_files_status_idx").on(table.status),
  importanceIdx: index("incoming_files_importance_idx").on(table.importance),
  arrivalIdx: index("incoming_files_arrival_idx").on(table.arrivalDate),
}));

export const fileHistory = mysqlTable("file_history", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  actorName: varchar("actorName", { length: 255 }).notNull(),
  actionType: varchar("actionType", { length: 128 }).notNull(),
  oldStatus: varchar("oldStatus", { length: 64 }),
  newStatus: varchar("newStatus", { length: 64 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  fileIdx: index("file_history_file_idx").on(table.fileId),
}));

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  recipientOpenId: varchar("recipientOpenId", { length: 128 }),
  recipientRole: varchar("recipientRole", { length: 64 }).default("director").notNull(),
  fileId: int("fileId"),
  kind: varchar("kind", { length: 64 }).notNull(),
  priority: mysqlEnum("priority", ["normal", "important", "urgent"]).default("normal").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index("notifications_recipient_idx").on(table.recipientOpenId),
  readIdx: index("notifications_read_idx").on(table.readAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type IncomingFile = typeof incomingFiles.$inferSelect;
export type InsertIncomingFile = typeof incomingFiles.$inferInsert;
export type FileHistory = typeof fileHistory.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
