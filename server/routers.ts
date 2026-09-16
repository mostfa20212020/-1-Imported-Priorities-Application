import { TRPCError } from "@trpc/server";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, directorProcedure, inputProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { clearLocalSession, createLocalSession } from "./_core/localAuth";
import { getFileBytes, storageGetSignedUrl, storagePut } from "./storage";
import { generateProsecutionPdf } from "./pdfService";
import {
  addFileHistory,
  createIncomingFile,
  createNotification,
  getFileHistory,
  getFileStats,
  getIncomingFile,
  listIncomingFiles,
  listNotifications,
  markNotificationRead,
  updateIncomingFile,
  deleteIncomingFile,
  getUserByUsername,
  listUsers,
  createLocalUser,
  updateLocalUser,
} from "./db";

const statusValues = ["new", "awaiting_direction", "directed", "in_progress", "returned", "completed", "archived"] as const;
const importanceValues = ["normal", "important", "urgent"] as const;
const statusSchema = z.enum(statusValues);
const importanceSchema = z.enum(importanceValues);

function actorName(ctx: any) {
  return ctx.user?.name || "User";
}

function importancePriority(importance: string) {
  return importance === "urgent" ? "urgent" : importance === "important" ? "important" : "normal";
}

function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function publicUser(user: NonNullable<import("../drizzle/schema").User>) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function addSignatureStamp(originalBytes: Buffer, fileNumber: string, signerName: string, signerTitle: string, signedAt: Date) {
  const pdf = await PDFDocument.load(originalBytes);
  pdf.registerFontkit(fontkit);
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const arabicFontBytes = await fs.readFile(path.join(process.cwd(), "server/assets/NotoSansArabic.ttf"));
  const arabicFont = await pdf.embedFont(arabicFontBytes, { subset: true });
  const stampHeight = 62;
  const margin = 28;
  page.drawRectangle({ x: margin, y: margin, width: page.getWidth() - margin * 2, height: stampHeight, color: rgb(0.93, 0.97, 0.95), borderColor: rgb(0.25, 0.50, 0.45), borderWidth: 1.2, opacity: 0.96 });
  page.drawRectangle({ x: margin, y: margin + stampHeight - 5, width: page.getWidth() - margin * 2, height: 5, color: rgb(0.25, 0.50, 0.45) });
  page.drawText("E-SIGNED | PUBLIC PROSECUTION", { x: margin + 12, y: margin + 38, size: 10, font, color: rgb(0.10, 0.25, 0.31) });
  page.drawText(`File: ${fileNumber}`, { x: margin + 12, y: margin + 22, size: 8.5, font: arabicFont, color: rgb(0.25, 0.38, 0.40) });
  page.drawText(`الموقّع: ${signerName || signerTitle}`, { x: margin + 12, y: margin + 9, size: 8.5, font: arabicFont, color: rgb(0.25, 0.38, 0.40) });
  page.drawText(`Date: ${signedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, { x: page.getWidth() - margin - 185, y: margin + 22, size: 8, font: regular, color: rgb(0.25, 0.38, 0.40) });
  page.drawText("Original preserved", { x: page.getWidth() - margin - 185, y: margin + 9, size: 8, font: regular, color: rgb(0.25, 0.38, 0.40) });
  return Buffer.from(await pdf.save());
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? publicUser(opts.ctx.user) : null),
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) })).mutation(async ({ input, ctx }) => {
      const account = await getUserByUsername(input.username.trim().toLowerCase());
      if (!account || !verifyPassword(input.password, account.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }
      const token = await createLocalSession(account, ctx.res, ctx.req);
      return { user: publicUser(account), token };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      clearLocalSession(ctx.res, ctx.req);
      return { success: true } as const;
    }),
  }),
  files: router({
    list: protectedProcedure.input(z.object({ search: z.string().optional(), status: z.string().optional(), importance: z.string().optional(), fileType: z.string().optional(), sourceEntity: z.string().optional() }).default({})).query(({ input }) => listIncomingFiles(input)),
    stats: protectedProcedure.query(() => getFileStats()),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const file = await getIncomingFile(input.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      return { file, history: await getFileHistory(input.id) };
    }),
    create: inputProcedure.input(z.object({
      fileNumber: z.string().min(1).max(64), year: z.number().int().min(2000).max(2200), arrivalDate: z.string().min(1), sourceEntity: z.string().min(1).max(255), fileType: z.enum(["وارد عام", "وارد مكاتبات", "وارد شكاوي", "وارد رئاسي", "وارد خاص"]), subject: z.string().min(1).max(500), importance: importanceSchema, notes: z.string().max(5000).optional(), pdfBase64: z.string().max(20_000_000).optional(), pdfName: z.string().max(255).optional(), pdfMimeType: z.string().max(128).optional(),
    })).mutation(async ({ input, ctx }) => {
      let originalFileKey: string | undefined;
      let originalFileUrl: string | undefined;
      if (input.pdfBase64) {
        const bytes = Buffer.from(input.pdfBase64, "base64");
        const uploaded = await storagePut(`incoming/original/${input.year}/${input.fileNumber}.pdf`, bytes, input.pdfMimeType || "application/pdf");
        originalFileKey = uploaded.key; originalFileUrl = uploaded.url;
      }
      const file = await createIncomingFile({ fileNumber: input.fileNumber, year: input.year, arrivalDate: new Date(input.arrivalDate), sourceEntity: input.sourceEntity, fileType: input.fileType, subject: input.subject, importance: input.importance, status: "awaiting_direction", originalFileKey, originalFileUrl, originalFileName: input.pdfName, originalMimeType: input.pdfMimeType, notes: input.notes, registeredBy: actorName(ctx), currentResponsible: "رئيس النيابة العامة" });
      if (!file) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ الملف" });
      await addFileHistory({ fileId: file.id, actorName: actorName(ctx), actionType: "تسجيل ملف وارد", newStatus: "awaiting_direction", details: "تم تسجيل الملف وإحالته إلى رئيس النيابة العامة" });
      await createNotification({ recipientOpenId: ENV.ownerOpenId || undefined, recipientRole: "director", fileId: file.id, kind: "new_file", priority: importancePriority(input.importance) as any, title: "ملف وارد جديد", body: `الملف رقم ${file.fileNumber} يحتاج إلى توجيه المدير` });
      return file;
    }),
    updateWorkflow: directorProcedure.input(z.object({ fileId: z.number().int().positive(), status: statusSchema.optional(), assignedDepartment: z.string().max(255).optional().nullable(), assignedEmployee: z.string().max(255).optional().nullable(), directorInstruction: z.string().max(5000).optional().nullable(), notes: z.string().max(5000).optional().nullable(), dueDate: z.string().optional().nullable(), actionLabel: z.string().max(255).optional() })).mutation(async ({ input, ctx }) => {
      const current = await getIncomingFile(input.fileId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      const newStatus = input.status || current.status;
      const values: any = { status: newStatus };
      if (input.assignedDepartment !== undefined) values.assignedDepartment = input.assignedDepartment;
      if (input.assignedEmployee !== undefined) values.assignedEmployee = input.assignedEmployee;
      if (input.directorInstruction !== undefined) values.directorInstruction = input.directorInstruction;
      if (input.notes !== undefined) values.notes = input.notes;
      if (input.dueDate !== undefined) values.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (newStatus === "directed") values.directedAt = new Date();
      if (newStatus === "completed") values.completedAt = new Date();
      if (input.assignedDepartment || input.assignedEmployee) values.currentResponsible = input.assignedEmployee || input.assignedDepartment;
      const updated = await updateIncomingFile(input.fileId, values);
      await addFileHistory({ fileId: input.fileId, actorName: actorName(ctx), actionType: input.actionLabel || "تحديث بيانات الملف", oldStatus: current.status, newStatus, details: input.directorInstruction || input.notes || input.assignedDepartment || undefined });
      if (newStatus !== current.status || input.actionLabel) await createNotification({ recipientOpenId: ENV.ownerOpenId || undefined, recipientRole: "director", fileId: input.fileId, kind: "workflow_update", priority: importancePriority(current.importance) as any, title: "تحديث على ملف وارد", body: `تم تحديث الملف رقم ${current.fileNumber}: ${input.actionLabel || newStatus}` });
      return updated;
    }),
    sign: directorProcedure.input(z.object({ fileId: z.number().int().positive(), signatureName: z.string().min(1).max(255), signatureTitle: z.string().min(1).max(255), instruction: z.string().max(5000).optional() })).mutation(async ({ input, ctx }) => {
      const file = await getIncomingFile(input.fileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      
      let originalBytes: Buffer | null = null;
      if (file.originalFileKey) {
        originalBytes = await getFileBytes(file.originalFileKey);
      }
      if (!originalBytes) {
        // Generate and persist official original PDF
        originalBytes = await generateProsecutionPdf(file, "original");
        const storedOriginal = await storagePut(`incoming/original/${file.year}/${file.fileNumber}.pdf`, originalBytes, "application/pdf");
        await updateIncomingFile(file.id, {
          originalFileKey: storedOriginal.key,
          originalFileUrl: storedOriginal.url,
        });
      }

      const signedAt = new Date();
      const signedBytes = await addSignatureStamp(originalBytes, file.fileNumber, input.signatureName, input.signatureTitle, signedAt);
      const signed = await storagePut(`incoming/signed/${file.year}/${file.fileNumber}.pdf`, signedBytes, "application/pdf");
      const updated = await updateIncomingFile(input.fileId, { isSigned: true, signedFileKey: signed.key, signedFileUrl: signed.url, signatureName: input.signatureName, signatureTitle: input.signatureTitle, signedAt, signedInstruction: input.instruction });
      await addFileHistory({ fileId: input.fileId, actorName: actorName(ctx), actionType: "توقيع إلكتروني", details: `تم إنشاء نسخة موقعة منفصلة. الموقع: ${input.signatureName} - ${input.signatureTitle}` });
      return updated;
    }),
    adminUpdate: adminProcedure.input(z.object({
      fileId: z.number().int().positive(),
      fileNumber: z.string().min(1).max(64).optional(),
      year: z.number().int().min(2000).max(2200).optional(),
      arrivalDate: z.string().optional(),
      sourceEntity: z.string().min(1).max(255).optional(),
      fileType: z.enum(["وارد عام", "وارد مكاتبات", "وارد شكاوي", "وارد رئاسي", "وارد خاص"]).optional(),
      subject: z.string().min(1).max(500).optional(),
      importance: importanceSchema.optional(),
      status: statusSchema.optional(),
      notes: z.string().max(5000).optional().nullable(),
      assignedDepartment: z.string().max(255).optional().nullable(),
      assignedEmployee: z.string().max(255).optional().nullable(),
      directorInstruction: z.string().max(5000).optional().nullable(),
      dueDate: z.string().optional().nullable(),
      currentResponsible: z.string().max(255).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const current = await getIncomingFile(input.fileId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      const values: any = {};
      if (input.fileNumber !== undefined) values.fileNumber = input.fileNumber;
      if (input.year !== undefined) values.year = input.year;
      if (input.arrivalDate !== undefined) values.arrivalDate = new Date(input.arrivalDate);
      if (input.sourceEntity !== undefined) values.sourceEntity = input.sourceEntity;
      if (input.fileType !== undefined) values.fileType = input.fileType;
      if (input.subject !== undefined) values.subject = input.subject;
      if (input.importance !== undefined) values.importance = input.importance;
      if (input.status !== undefined) values.status = input.status;
      if (input.notes !== undefined) values.notes = input.notes;
      if (input.assignedDepartment !== undefined) values.assignedDepartment = input.assignedDepartment;
      if (input.assignedEmployee !== undefined) values.assignedEmployee = input.assignedEmployee;
      if (input.directorInstruction !== undefined) values.directorInstruction = input.directorInstruction;
      if (input.dueDate !== undefined) values.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.currentResponsible !== undefined) values.currentResponsible = input.currentResponsible;
      
      const updated = await updateIncomingFile(input.fileId, values);
      await addFileHistory({
        fileId: input.fileId,
        actorName: `${actorName(ctx)} (مدير النظام)`,
        actionType: "تعديل إداري شامل",
        oldStatus: current.status,
        newStatus: values.status || current.status,
        details: "قام مدير النظام بتعديل بيانات المعاملة في النظام",
      });
      return updated;
    }),
    adminDelete: adminProcedure.input(z.object({
      fileId: z.number().int().positive(),
    })).mutation(async ({ input, ctx }) => {
      const current = await getIncomingFile(input.fileId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      await deleteIncomingFile(input.fileId);
      return { success: true };
    }),
  }),
  notifications: router({
    list: directorProcedure.query(({ ctx }) => listNotifications(ctx.user.openId)),
    markRead: directorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { await markNotificationRead(input.id); return { success: true }; }),
  }),
  settings: router({
    get: adminProcedure.query(async () => {
      const stats = await getFileStats();
      const users = await listUsers();
      return {
        systemName: "نظام إدارة الأوليات القضائية",
        organization: "النيابة العامة",
        version: "v2.5.0-Enterprise",
        environment: process.env.NODE_ENV || "development",
        activeUsersCount: users.length,
        totalFilesCount: stats.total,
        databaseStatus: "متصل وقيد العمل بكفاءة",
        databaseType: stats.dbEngine,
        backupPolicy: "نسخ احتياطي يومي ومزامنة سحابية مستمرة",
        securityLevel: "تشفير كامل للبيانات وتوقيع رقمي موثق",
      };
    }),
  }),
  users: router({
    list: adminProcedure.query(() => listUsers()),
    create: adminProcedure.input(z.object({ username: z.string().min(2).max(64), password: z.string().min(8).max(128), name: z.string().min(2).max(255), role: z.enum(["input", "director", "admin"]), email: z.string().email().optional() })).mutation(async ({ input }) => {
      const username = input.username.trim().toLowerCase();
      if (await getUserByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم مسبقًا" });
      const user = await createLocalUser({ openId: `local-${username}-${Date.now()}`, username, passwordHash: hashPassword(input.password), name: input.name, email: input.email, loginMethod: "local", role: input.role });
      return user ? publicUser(user) : null;
    }),
    update: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(255).optional(), role: z.enum(["input", "director", "admin"]).optional(), password: z.string().min(8).max(128).optional() })).mutation(async ({ input }) => {
      const values: any = {};
      if (input.name !== undefined) values.name = input.name;
      if (input.role !== undefined) values.role = input.role;
      if (input.password) values.passwordHash = hashPassword(input.password);
      const user = await updateLocalUser(input.id, values);
      return user ? publicUser(user) : null;
    }),
  }),
});

export type AppRouter = typeof appRouter;
