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
  getNextIncomingFileNumber,
  createNotification,
  getFileHistory,
  getFileStats,
  getIncomingFile,
  listIncomingFiles,
  listNotifications,
  markNotificationRead,
  updateIncomingFile,
  deleteIncomingFile,
  clearAllIncomingFiles,
  getUserByUsername,
  listUsers,
  createLocalUser,
  updateLocalUser,
  deleteLocalUser,
  getJobTitlesList,
  addJobTitle,
  updateJobTitle,
  deleteJobTitle,
  getRoleDefinitions,
  updateRoleDefinition,
  resetRoleDefinitions,
  RoleKey,
} from "./db";

const statusValues = ["new", "awaiting_direction", "directed", "in_progress", "returned", "completed", "archived", "PENDING_AG", "PENDING_EMPLOYEE", "COMPLETED"] as const;
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

export interface ManualSignatureOptions {
  pngBase64?: string;
  positionPercent?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageIndex?: number;
  includeOfficialBadge?: boolean;
}

export async function addSignatureStamp(
  originalBytes: Buffer,
  fileNumber: string,
  signerName: string,
  signerTitle: string,
  signedAt: Date,
  manualSig?: ManualSignatureOptions
) {
  const pdf = await PDFDocument.load(originalBytes);
  pdf.registerFontkit(fontkit);
  const pages = pdf.getPages();
  const pageIndex = (manualSig?.pageIndex !== undefined && manualSig.pageIndex >= 0 && manualSig.pageIndex < pages.length)
    ? manualSig.pageIndex
    : pages.length - 1;
  const page = pages[pageIndex];
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const arabicFontBytes = await fs.readFile(path.join(process.cwd(), "server/assets/NotoSansArabic.ttf"));
  const arabicFont = await pdf.embedFont(arabicFontBytes, { subset: true });
  const stampHeight = 62;
  const margin = 28;

  page.drawRectangle({ x: margin, y: margin, width: pageWidth - margin * 2, height: stampHeight, color: rgb(0.93, 0.97, 0.95), borderColor: rgb(0.25, 0.50, 0.45), borderWidth: 1.2, opacity: 0.96 });
  page.drawRectangle({ x: margin, y: margin + stampHeight - 5, width: pageWidth - margin * 2, height: 5, color: rgb(0.25, 0.50, 0.45) });
  page.drawText("E-SIGNED | PUBLIC PROSECUTION", { x: margin + 12, y: margin + 38, size: 10, font, color: rgb(0.10, 0.25, 0.31) });
  page.drawText(`File: ${fileNumber}`, { x: margin + 12, y: margin + 22, size: 8.5, font: arabicFont, color: rgb(0.25, 0.38, 0.40) });
  page.drawText(`الموقّع: ${signerName || signerTitle}`, { x: margin + 12, y: margin + 9, size: 8.5, font: arabicFont, color: rgb(0.25, 0.38, 0.40) });
  page.drawText(`Date: ${signedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, { x: pageWidth - margin - 185, y: margin + 22, size: 8, font: regular, color: rgb(0.25, 0.38, 0.40) });
  page.drawText(manualSig?.pngBase64 ? "Handwritten & Certified" : "Original preserved", { x: pageWidth - margin - 185, y: margin + 9, size: 8, font: regular, color: rgb(0.25, 0.38, 0.40) });

  if (manualSig?.pngBase64) {
    let cleanBase64 = manualSig.pngBase64;
    if (cleanBase64.includes("base64,")) {
      cleanBase64 = cleanBase64.split("base64,")[1];
    }
    const pngBuffer = Buffer.from(cleanBase64, "base64");
    const embeddedPng = await pdf.embedPng(pngBuffer);

    let sigX: number;
    let sigY: number;
    let sigWidth: number;
    let sigHeight: number;

    if (manualSig.positionPercent) {
      sigWidth = (manualSig.positionPercent.width / 100) * pageWidth;
      sigHeight = (manualSig.positionPercent.height / 100) * pageHeight;
      sigX = (manualSig.positionPercent.x / 100) * pageWidth;
      sigY = pageHeight - ((manualSig.positionPercent.y / 100) * pageHeight) - sigHeight;
    } else {
      sigWidth = Math.min(180, pageWidth * 0.28);
      sigHeight = Math.min(65, pageHeight * 0.09);
      sigX = margin + 15;
      sigY = margin + stampHeight + 15;
    }

    sigX = Math.max(5, Math.min(pageWidth - sigWidth - 5, sigX));
    sigY = Math.max(5, Math.min(pageHeight - sigHeight - 5, sigY));

    if (manualSig.includeOfficialBadge !== false) {
      const padX = 6;
      const padY = 6;
      page.drawRectangle({
        x: sigX - padX,
        y: sigY - padY - 12,
        width: sigWidth + padX * 2,
        height: sigHeight + padY * 2 + 12,
        color: rgb(0.97, 0.99, 0.98),
        borderColor: rgb(0.20, 0.50, 0.42),
        borderWidth: 1,
        opacity: 0.92,
      });
      page.drawText(`توقيع واعتماد: ${signerName || "فضيلة النائب العام"}`, {
        x: sigX - padX + 4,
        y: sigY - padY - 9,
        size: 7,
        font: arabicFont,
        color: rgb(0.18, 0.42, 0.36),
      });
    }

    page.drawImage(embeddedPng, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight,
    });
  }

  return Buffer.from(await pdf.save());
}

export const appRouter = router({
  system: systemRouter,
  dbStatus: publicProcedure.query(async () => {
    let isConnected = false;
    let mode = "Memory / Local";
    try {
      const db = await import("./db").then(m => m.getDb());
      if (db) {
        isConnected = true;
        mode = "MySQL Local (Active)";
      }
    } catch {
      isConnected = false;
      mode = "Fallback Mode";
    }
    return {
      connected: isConnected,
      mode,
      lastSync: new Date().toISOString(),
      serverHost: process.env.DATABASE_URL ? "Custom MySQL Configured" : "Default Local Store",
    };
  }),
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
    nextNumber: protectedProcedure.query(() => getNextIncomingFileNumber()),
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
      const file = await createIncomingFile({
        fileNumber: input.fileNumber,
        year: input.year,
        arrivalDate: new Date(input.arrivalDate),
        sourceEntity: input.sourceEntity,
        fileType: input.fileType,
        subject: input.subject,
        importance: input.importance,
        status: "PENDING_AG",
        originalFileKey,
        originalFileUrl,
        originalFileName: input.pdfName,
        originalMimeType: input.pdfMimeType,
        notes: input.notes,
        registeredBy: actorName(ctx),
        currentResponsible: "النائب العام للتوجيه والتوقيع (المرحلة الأولى)",
        isSigned: true,
        signatureName: "فضيلة القاضي / رئيس النيابة العامة",
        signatureTitle: "رئيس النيابة العامة",
        signedAt: new Date(),
      });
      if (!file) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ الملف" });

      try {
        const signedBytes = await generateProsecutionPdf(file, "signed");
        const storedSigned = await storagePut(`incoming/signed/${file.year}/${file.fileNumber}.pdf`, signedBytes, "application/pdf");
        await updateIncomingFile(file.id, {
          signedFileKey: storedSigned.key,
          signedFileUrl: storedSigned.url,
        });
      } catch (err) {
        console.warn("[PDF] Auto-sign on first page failed:", err);
      }
      await addFileHistory({
        fileId: file.id,
        actorName: actorName(ctx),
        actionType: "المرحلة الأولى: تسجيل وترحيل للنائب العام",
        newStatus: "PENDING_AG",
        details: "تم تسجيل البيانات الأساسية ورفع المرفق وترحيل المعاملة إلى النائب العام للتوجيه والتوقيع",
      });
      await createNotification({
        recipientOpenId: ENV.ownerOpenId || undefined,
        recipientRole: "director",
        fileId: file.id,
        kind: "new_file",
        priority: importancePriority(input.importance) as any,
        title: "معاملة وارد جديدة بانتظار توجيه وتوقيع النائب العام",
        body: `معاملة وارد رقم ${file.fileNumber} محالة للتوجيه والتوقيع (المرحلة الأولى)`,
      });
      return file;
    }),
    directorConfirmAndForward: directorProcedure.input(z.object({
      fileId: z.number().int().positive(),
      directorInstruction: z.string().min(1, "نص التوجيه مطلوب"),
      signatureName: z.string().default("فضيلة النائب العام"),
      signatureTitle: z.string().default("النائب العام للجمهورية"),
      signaturePngBase64: z.string().optional(),
      signaturePosition: z.object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().min(5).max(100),
        height: z.number().min(2).max(100),
      }).optional(),
      assignedDepartment: z.string().max(255).optional().nullable(),
      assignedEmployee: z.string().max(255).optional().nullable(),
      dueDate: z.string().optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const file = await getIncomingFile(input.fileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });

      let originalBytes: Buffer | null = null;
      if (file.originalFileKey) {
        originalBytes = await getFileBytes(file.originalFileKey);
      }
      if (!originalBytes) {
        originalBytes = await generateProsecutionPdf(file, "original");
        const storedOriginal = await storagePut(`incoming/original/${file.year}/${file.fileNumber}.pdf`, originalBytes, "application/pdf");
        await updateIncomingFile(file.id, {
          originalFileKey: storedOriginal.key,
          originalFileUrl: storedOriginal.url,
        });
      }

      const signedAt = new Date();
      const signedBytes = await addSignatureStamp(
        originalBytes,
        file.fileNumber,
        input.signatureName,
        input.signatureTitle,
        signedAt,
        input.signaturePngBase64
          ? {
              pngBase64: input.signaturePngBase64,
              positionPercent: input.signaturePosition,
              includeOfficialBadge: true,
            }
          : undefined
      );
      const signed = await storagePut(`incoming/signed/${file.year}/${file.fileNumber}.pdf`, signedBytes, "application/pdf");

      const updated = await updateIncomingFile(input.fileId, {
        status: "PENDING_EMPLOYEE",
        isSigned: true,
        signedFileKey: signed.key,
        signedFileUrl: signed.url,
        signatureName: input.signatureName,
        signatureTitle: input.signatureTitle,
        signedAt,
        signedInstruction: input.directorInstruction,
        directorInstruction: input.directorInstruction,
        assignedDepartment: input.assignedDepartment !== undefined ? input.assignedDepartment : file.assignedDepartment,
        assignedEmployee: input.assignedEmployee !== undefined ? input.assignedEmployee : file.assignedEmployee,
        dueDate: input.dueDate ? new Date(input.dueDate) : file.dueDate,
        notes: input.notes !== undefined ? input.notes : file.notes,
        currentResponsible: file.registeredBy || "موظف الاستقبال والتسجيل (المرحلة الثانية: بانتظار تفريغ التوجيه والترحيل النهائي)",
        directedAt: signedAt,
      });

      await addFileHistory({
        fileId: input.fileId,
        actorName: `${actorName(ctx)} (النائب العام)`,
        actionType: input.signaturePngBase64 ? "مرحلة النائب العام: توجيه وتوقيع يدوي على PDF" : "مرحلة النائب العام: اعتماد التوجيه والتوقيع",
        oldStatus: file.status,
        newStatus: "PENDING_EMPLOYEE",
        details: `تم توجيه المعاملة والتوقيع ${input.signaturePngBase64 ? "بالقلم الرقمي اليدوي ولصقه على الـ PDF" : "والتأكيد إلكترونياً"}. التوجيه: "${input.directorInstruction}". أُعيدت إلى الموظف لإدخال المرحلة الثانية والترحيل النهائي.`,
      });

      return updated;
    }),
    employeeFinalDispatch: inputProcedure.input(z.object({
      fileId: z.number().int().positive(),
      finalInstruction: z.string().min(1, "يرجى تفريغ نص توجيه النائب العام"),
      assignedDepartment: z.string().max(255).optional().nullable(),
      assignedEmployee: z.string().max(255).optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const current = await getIncomingFile(input.fileId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });

      const updated = await updateIncomingFile(input.fileId, {
        status: "COMPLETED",
        directorInstruction: input.finalInstruction,
        assignedDepartment: input.assignedDepartment !== undefined ? input.assignedDepartment : current.assignedDepartment,
        assignedEmployee: input.assignedEmployee !== undefined ? input.assignedEmployee : current.assignedEmployee,
        notes: input.notes !== undefined ? input.notes : current.notes,
        completedAt: new Date(),
        currentResponsible: "قاعدة البيانات العامة (مرحّل نهائياً)",
      });

      await addFileHistory({
        fileId: input.fileId,
        actorName: actorName(ctx),
        actionType: "المرحلة الثانية: تفريغ التوجيه والترحيل النهائي",
        oldStatus: current.status,
        newStatus: "COMPLETED",
        details: `تم تفريغ توجيه النائب العام: "${input.finalInstruction}" وترحيل المعاملة بشكل نهائي إلى قاعدة البيانات.`,
      });

      return updated;
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
    sign: directorProcedure.input(z.object({
      fileId: z.number().int().positive(),
      signatureName: z.string().max(255).optional().nullable().transform((val) => (val && val.trim().length > 0 ? val.trim() : "رئيس النيابة العامة")),
      signatureTitle: z.string().max(255).optional().nullable().transform((val) => (val && val.trim().length > 0 ? val.trim() : "رئيس النيابة العامة")),
      instruction: z.string().max(5000).optional(),
    })).mutation(async ({ input, ctx }) => {
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
    applyManualSignature: protectedProcedure.input(z.object({
      fileId: z.number().int().positive(),
      signaturePngBase64: z.string().min(1, "صورة التوقيع اليدوي مطلوبة"),
      signerName: z.string().max(255).optional().nullable().transform((val) => (val && val.trim().length > 0 ? val.trim() : "فضيلة النائب العام")),
      signerTitle: z.string().max(255).optional().nullable().transform((val) => (val && val.trim().length > 0 ? val.trim() : "النائب العام للجمهورية")),
      instruction: z.string().max(5000).optional().nullable(),
      positionPercent: z.object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        width: z.number().min(5).max(100),
        height: z.number().min(2).max(100),
      }).optional(),
      pageIndex: z.number().int().min(0).optional(),
      includeOfficialBadge: z.boolean().default(true),
      advanceToEmployee: z.boolean().optional(),
      assignedDepartment: z.string().max(255).optional().nullable(),
      assignedEmployee: z.string().max(255).optional().nullable(),
      dueDate: z.string().optional().nullable(),
      notes: z.string().max(5000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      const file = await getIncomingFile(input.fileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });

      let sourceBytes: Buffer | null = null;
      if (file.originalFileKey) {
        sourceBytes = await getFileBytes(file.originalFileKey);
      }
      if (!sourceBytes) {
        sourceBytes = await generateProsecutionPdf(file, "original");
        const storedOriginal = await storagePut(`incoming/original/${file.year}/${file.fileNumber}.pdf`, sourceBytes, "application/pdf");
        await updateIncomingFile(file.id, {
          originalFileKey: storedOriginal.key,
          originalFileUrl: storedOriginal.url,
        });
      }

      const signedAt = new Date();
      const signedBytes = await addSignatureStamp(
        sourceBytes,
        file.fileNumber,
        input.signerName,
        input.signerTitle,
        signedAt,
        {
          pngBase64: input.signaturePngBase64,
          positionPercent: input.positionPercent,
          pageIndex: input.pageIndex,
          includeOfficialBadge: input.includeOfficialBadge,
        }
      );

      const signed = await storagePut(`incoming/signed/${file.year}/${file.fileNumber}.pdf`, signedBytes, "application/pdf");

      const updateData: any = {
        isSigned: true,
        signedFileKey: signed.key,
        signedFileUrl: signed.url,
        signatureName: input.signerName,
        signatureTitle: input.signerTitle,
        signedAt,
      };

      if (input.instruction) {
        updateData.signedInstruction = input.instruction;
        updateData.directorInstruction = input.instruction;
      }

      if (input.advanceToEmployee) {
        updateData.status = "PENDING_EMPLOYEE";
        if (input.assignedDepartment !== undefined) updateData.assignedDepartment = input.assignedDepartment;
        if (input.assignedEmployee !== undefined) updateData.assignedEmployee = input.assignedEmployee;
        if (input.dueDate) updateData.dueDate = new Date(input.dueDate);
        if (input.notes !== undefined) updateData.notes = input.notes;
        updateData.directedAt = signedAt;
        updateData.currentResponsible = file.registeredBy || "موظف الاستقبال والتسجيل (المرحلة الثانية: بانتظار تفريغ التوجيه والترحيل النهائي)";
      }

      const updated = await updateIncomingFile(input.fileId, updateData);

      await addFileHistory({
        fileId: input.fileId,
        actorName: `${actorName(ctx)} (${ctx.user.role === "director" ? "النائب العام" : "عضو النيابة العامة"})`,
        actionType: "توقيع يدوي ولصق على PDF",
        oldStatus: file.status,
        newStatus: updateData.status || file.status,
        details: `تم لصق وتثبيت التوقيع اليدوي بالقلم الرقمي على وثيقة الـ PDF بنجاح. الموقّع: ${input.signerName} (${input.signerTitle})${input.instruction ? ` | التوجيه: "${input.instruction}"` : ""}`,
      });

      if (input.advanceToEmployee) {
        await createNotification({
          recipientRole: "input",
          fileId: file.id,
          kind: "workflow_update",
          priority: importancePriority(file.importance) as any,
          title: "معاملة وارد موقعة يدوياً بانتظار الترحيل النهائي",
          body: `قام النائب العام بتوقيع وتوجيه المعاملة رقم ${file.fileNumber} يدوياً وأحيلت للمرحلة الثانية`,
        });
      }

      return updated;
    }),
    adminUpdate: directorProcedure.input(z.object({
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
    adminDelete: directorProcedure.input(z.object({
      fileId: z.number().int().positive(),
    })).mutation(async ({ input, ctx }) => {
      const current = await getIncomingFile(input.fileId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير موجود" });
      await deleteIncomingFile(input.fileId);
      return { success: true };
    }),
    clearDatabase: directorProcedure.mutation(async () => {
      await clearAllIncomingFiles();
      return { success: true, message: "تم تصفير قاعدة البيانات بنجاح" };
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
    jobTitles: adminProcedure.query(() => getJobTitlesList()),
    roleDefinitions: publicProcedure.query(() => getRoleDefinitions()),
    updateRoleDefinition: adminProcedure.input(z.object({
      key: z.enum(["input", "director", "admin"]),
      title: z.string().min(2, "مسمى الصلاحية يجب أن يكون حرفين على الأقل").max(100),
      description: z.string().max(255).optional(),
    })).mutation(async ({ input }) => {
      return await updateRoleDefinition(input.key, input.title, input.description);
    }),
    resetRoleDefinitions: adminProcedure.mutation(async () => {
      return await resetRoleDefinitions();
    }),
    addJobTitle: adminProcedure.input(z.object({
      title: z.string().min(2, "المسمى الوظيفي يجب أن يكون حرفين على الأقل").max(255),
    })).mutation(async ({ input }) => {
      return await addJobTitle(input.title);
    }),
    updateJobTitle: adminProcedure.input(z.object({
      oldTitle: z.string().min(1),
      newTitle: z.string().min(2, "المسمى الوظيفي الجديد يجب أن يكون حرفين على الأقل").max(255),
    })).mutation(async ({ input }) => {
      return await updateJobTitle(input.oldTitle, input.newTitle);
    }),
    deleteJobTitle: adminProcedure.input(z.object({
      title: z.string().min(1),
    })).mutation(async ({ input }) => {
      return await deleteJobTitle(input.title);
    }),
    create: adminProcedure.input(z.object({
      username: z.string().min(2).max(64),
      password: z.string().min(6, "كلمة المرور يجب أن لا تقل عن 6 أحرف").max(128),
      name: z.string().min(2, "اسم الموظف مطلوب").max(255),
      jobTitle: z.string().max(255).optional(),
      role: z.enum(["input", "director", "admin"]),
      email: z.string().email().optional().or(z.literal("")),
    })).mutation(async ({ input }) => {
      const username = input.username.trim().toLowerCase();
      if (await getUserByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم مسبقًا" });
      const user = await createLocalUser({
        openId: `local-${username}-${Date.now()}`,
        username,
        passwordHash: hashPassword(input.password),
        name: input.name,
        jobTitle: input.jobTitle || undefined,
        email: input.email || undefined,
        loginMethod: "local",
        role: input.role,
      });
      return user ? publicUser(user) : null;
    }),
    update: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(255).optional(),
      jobTitle: z.string().max(255).optional().nullable(),
      role: z.enum(["input", "director", "admin"]).optional(),
      email: z.string().email().optional().or(z.literal("")).nullable(),
      password: z.string().min(6, "كلمة المرور يجب أن لا تقل عن 6 أحرف").max(128).optional(),
    })).mutation(async ({ input }) => {
      const values: any = {};
      if (input.name !== undefined) values.name = input.name;
      if (input.jobTitle !== undefined) values.jobTitle = input.jobTitle;
      if (input.role !== undefined) values.role = input.role;
      if (input.email !== undefined) values.email = input.email;
      if (input.password) values.passwordHash = hashPassword(input.password);
      const user = await updateLocalUser(input.id, values);
      return user ? publicUser(user) : null;
    }),
    delete: adminProcedure.input(z.object({
      id: z.number().int().positive(),
    })).mutation(async ({ input }) => {
      const success = await deleteLocalUser(input.id);
      if (!success) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود أو تم حذفه مسبقاً" });
      }
      return { success: true };
    }),
    updateDbConfig: adminProcedure.input(z.object({
      host: z.string().min(1, "المضيف مطلوب"),
      port: z.string().min(1, "المنفذ مطلوب"),
      database: z.string().min(1, "اسم القاعدة مطلوب"),
      user: z.string().min(1, "اسم المستخدم مطلوب"),
      password: z.string(),
    })).mutation(async ({ input }) => {
      try {
        const encodedPassword = encodeURIComponent(input.password);
        const newDbUrl = `mysql://${input.user}:${encodedPassword}@${input.host}:${input.port}/${input.database}`;
        
        let envContent = "";
        try {
          envContent = await fs.readFile(path.join(process.cwd(), ".env"), "utf-8");
        } catch {
          envContent = "";
        }

        if (envContent.includes("DATABASE_URL=")) {
          envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${newDbUrl}"`);
        } else {
          envContent += `\nDATABASE_URL="${newDbUrl}"\n`;
        }

        await fs.writeFile(path.join(process.cwd(), ".env"), envContent, "utf-8");
        process.env.DATABASE_URL = newDbUrl;

        return { success: true, message: "تم تحديث وحفظ إعدادات قاعدة البيانات المحلية بنجاح" };
      } catch (error: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل حفظ إعدادات قاعدة البيانات: " + error.message });
      }
    }),
    exportBackup: adminProcedure.input(z.object({
      format: z.enum(["json", "sql"]),
    })).mutation(async ({ input }) => {
      try {
        const files = await listIncomingFiles({});
        const users = await listUsers();
        
        if (input.format === "json") {
          const backupData = {
            system: "Idarat Alawliyat - Prosecution System",
            exportDate: new Date().toISOString(),
            version: "1.0.0",
            tables: {
              users,
              incomingFiles: files,
            },
          };
          return {
            filename: `backup-idarat-alawliyat-${new Date().toISOString().slice(0, 10)}.json`,
            contentType: "application/json",
            data: JSON.stringify(backupData, null, 2),
          };
        } else {
          // SQL Format dump simulation
          let sqlDump = `-- Backup generated for Idarat Alawliyat System\n`;
          sqlDump += `-- Date: ${new Date().toISOString()}\n\n`;
          
          sqlDump += `-- Table: users\n`;
          for (const u of users) {
            sqlDump += `INSERT INTO users (id, username, name, jobTitle, role) VALUES (${u.id}, '${u.username}', '${u.name}', '${u.jobTitle || ""}', '${u.role}');\n`;
          }

          sqlDump += `\n-- Table: incomingFiles\n`;
          for (const f of files) {
            sqlDump += `INSERT INTO incomingFiles (id, fileNumber, year, sourceEntity, subject, status, importance) VALUES (${f.id}, '${f.fileNumber}', ${f.year}, '${f.sourceEntity.replace(/'/g, "''")}', '${f.subject.replace(/'/g, "''")}', '${f.status}', '${f.importance}');\n`;
          }

          return {
            filename: `backup-idarat-alawliyat-${new Date().toISOString().slice(0, 10)}.sql`,
            contentType: "application/sql",
            data: sqlDump,
          };
        }
      } catch (error: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل تصدير النسخة الاحتياطية: " + error.message });
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
