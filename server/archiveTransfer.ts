import { eq, desc, and } from "drizzle-orm";
import { getIncomingFile, getFileHistory } from "./db.ts";
import { getFileBytes } from "./storage.ts";
import {
  computePdfHash,
  saveArchivePdfVersion,
  verifyArchivePdfIntegrity,
  readArchivePdf,
} from "./archiveStorage.ts";
import { getLocalDb, isLocalMysqlConfigured } from "../src/db/localMysql.ts";
import {
  archives,
  pdfVersions,
  auditLogs,
  archiveTransfers,
  incomingFiles,
} from "../src/db/schema.ts";

export type TransferResultStatus =
  | "COMPLETED"
  | "ALREADY_ARCHIVED"
  | "FAILED"
  | "LOCAL_MYSQL_NOT_CONFIGURED";

export interface TransferResult {
  success: boolean;
  status: TransferResultStatus;
  fileId: number;
  fileNumber: string;
  archiveId?: number;
  versionId?: number;
  pdfPath?: string;
  pdfHash?: string;
  attemptCount: number;
  message: string;
  transferId?: number;
  error?: string;
  isRetryable?: boolean;
}

export interface TransferOptions {
  actorName?: string;
  userId?: number;
  overrideLocalDb?: any;
  overridePdfBytes?: Buffer; // For testing or direct pass
}

/**
 * دالة ترحيل المعاملة المكتملة من Cloud SQL إلى MySQL المحلية والأرشيف المحلي
 * تنفذ الـ 13 خطوة الإلزامية مع ضمان الـ Idempotency وحماية البيانات من الفقدان
 */
export async function transferTransactionToLocalArchive(
  fileId: number,
  options: TransferOptions = {}
): Promise<TransferResult> {
  const actorName = options.actorName || "نظام الترحيل الآلي";

  // 1. قراءة بيانات المعاملة من Cloud SQL والتحقق من وجودها
  const file = await getIncomingFile(fileId);
  if (!file) {
    return {
      success: false,
      status: "FAILED",
      fileId,
      fileNumber: `ID-${fileId}`,
      attemptCount: 0,
      message: `المعاملة رقم (${fileId}) غير موجودة في Cloud SQL`,
      error: "FILE_NOT_FOUND",
      isRetryable: false,
    };
  }

  // 2. التحقق من أن المعاملة مكتملة بالكامل
  const isCompleted =
    file.status === "completed" ||
    file.status === "COMPLETED" ||
    file.status === "archived";

  if (!isCompleted) {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 0,
      message: `المعاملة غير مكتملة (حالتها الحالية: ${file.status}). لا يمكن ترحيلها إلى الأرشيف قبل اكتمالها وتوقيعها رسمياً.`,
      error: "TRANSACTION_NOT_COMPLETED",
      isRetryable: false,
    };
  }

  // 3. التحقق من وجود مفتاح الـ PDF النهائي الموقع
  const pdfKey = file.signedFileKey || (file.isSigned ? file.originalFileKey : null);
  if (!pdfKey && !options.overridePdfBytes) {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 0,
      message: "ملف الـ PDF النهائي الموقع غير موجود في سجل المعاملة",
      error: "SIGNED_PDF_MISSING",
      isRetryable: false,
    };
  }

  // 4. التحقق من توفر وتهيئة اتصال MySQL المحلية
  const localDb = options.overrideLocalDb || getLocalDb();
  if (!localDb) {
    return {
      success: false,
      status: "LOCAL_MYSQL_NOT_CONFIGURED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 0,
      message:
        "قاعدة بيانات MySQL المحلية غير مهيأة (LOCAL_MYSQL_NOT_CONFIGURED). يرجى ضبط متغيرات LOCAL_MYSQL_* في بيئة التشغيل.",
      error: "LOCAL_MYSQL_NOT_CONFIGURED",
      isRetryable: true,
    };
  }

  // 5. فحص منع الترحيل المكرر (Idempotency)
  // إذا كانت المعاملة مؤرشفة بالفعل في Local MySQL، لا يتم إنشاء أرشيف جديد أو إصدار مكرر
  try {
    const existingArchive = await localDb
      .select()
      .from(archives)
      .where(eq(archives.fileId, file.id))
      .limit(1);

    if (existingArchive.length > 0) {
      return {
        success: true,
        status: "ALREADY_ARCHIVED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        archiveId: existingArchive[0].id,
        pdfHash: existingArchive[0].originalPdfHash || undefined,
        attemptCount: 1,
        message: `المعاملة (${file.fileNumber}) مؤرشفة بالفعل مسبقاً في Local MySQL (معرف الأرشيف: ${existingArchive[0].id}). لن يتم تكرار الترحيل.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 1,
      message: `فشل الاتصال بقاعدة MySQL المحلية لفحص الأرشيف: ${err?.message || "خطأ غير معروف"}`,
      error: err?.message,
      isRetryable: true,
    };
  }

  // 6. استرجاع وتحديث سجل الترحيل archive_transfers
  let transferId: number | undefined;
  let attemptCount = 1;

  try {
    const existingTransfers = await localDb
      .select()
      .from(archiveTransfers)
      .where(eq(archiveTransfers.fileId, file.id))
      .orderBy(desc(archiveTransfers.id))
      .limit(1);

    if (existingTransfers.length > 0) {
      attemptCount = (existingTransfers[0].attemptCount || 0) + 1;
      transferId = existingTransfers[0].id;

      // إذا كان الترحيل مكتملاً بالفعل
      if (existingTransfers[0].transferStatus === "COMPLETED") {
        return {
          success: true,
          status: "ALREADY_ARCHIVED",
          fileId: file.id,
          fileNumber: file.fileNumber,
          archiveId: existingTransfers[0].archiveId || undefined,
          pdfHash: existingTransfers[0].pdfHash || undefined,
          attemptCount,
          message: `المعاملة (${file.fileNumber}) تم ترحيلها مسبقاً بنجاح وحالتها COMPLETED.`,
        };
      }

      if (transferId) {
        await localDb
          .update(archiveTransfers)
          .set({
            transferStatus: "TRANSFERRING",
            attemptCount,
            lastAttemptAt: new Date(),
            startedAt: existingTransfers[0].startedAt || new Date(),
            errorMessage: null,
          })
          .where(eq(archiveTransfers.id, transferId));
      }
    } else {
      // إدراج سجل الترحيل الأول
      const [insertResult] = await localDb.insert(archiveTransfers).values({
        fileId: file.id,
        transferStatus: "TRANSFERRING",
        attemptCount: 1,
        startedAt: new Date(),
        lastAttemptAt: new Date(),
        sourceReference: "cloud_sql_mysql",
        destinationReference: "local_mysql",
      });
      transferId = (insertResult as any)?.insertId;
    }
  } catch (err: any) {
    console.warn("[ArchiveTransfer] Could not update transfer record:", err);
  }

  // 7. قراءة الـ PDF النهائي من نظام التخزين الحالي (server/storage.ts)
  let pdfBuffer: Buffer | null = null;
  if (options.overridePdfBytes) {
    pdfBuffer = options.overridePdfBytes;
  } else if (pdfKey) {
    try {
      pdfBuffer = await getFileBytes(pdfKey);
    } catch (readErr: any) {
      const errMsg = `فشل استرجاع ملف الـ PDF من نظام التخزين: ${readErr?.message || "خطأ غير معروف"}`;
      await recordTransferFailure(localDb, transferId, errMsg);
      return {
        success: false,
        status: "FAILED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        attemptCount,
        message: errMsg,
        error: "STORAGE_READ_ERROR",
        isRetryable: true,
      };
    }
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    const errMsg = "محتوى ملف الـ PDF فارغ أو غير موجود في نظام التخزين";
    await recordTransferFailure(localDb, transferId, errMsg);
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount,
      message: errMsg,
      error: "EMPTY_PDF_CONTENT",
      isRetryable: true,
    };
  }

  // 8. التحقق من سلامة ترويسة ملف الـ PDF
  const pdfHeader = pdfBuffer.subarray(0, 5).toString("ascii");
  if (!pdfHeader.startsWith("%PDF-")) {
    const errMsg = "الملف المسترجع تالف أو لا يمثل مستند PDF صالح (مفقود %PDF-)";
    await recordTransferFailure(localDb, transferId, errMsg);
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount,
      message: errMsg,
      error: "INVALID_PDF_FORMAT",
      isRetryable: false,
    };
  }

  // 9. حساب البصمة الرقمية SHA-256 قبل الحفظ
  const initialHash = computePdfHash(pdfBuffer);
  const fileSize = pdfBuffer.length;

  // 10. حفظ الـ PDF في مجلد الأرشيف المحلي عبر server/archiveStorage.ts
  let savedFile;
  try {
    savedFile = await saveArchivePdfVersion({
      year: file.year,
      fileNumber: file.fileNumber,
      versionNumber: 1,
      pdfBuffer,
      allowOverwrite: false, // حظر قاطع لأي كتابة فوق ملف موجود
    });
  } catch (saveErr: any) {
    // إذا كان الملف موجوداً مسبقاً على القرص لنفس الإصدار، نفحص هل هو مطابق
    if (saveErr.message?.includes("موجود مسبقاً")) {
      const { relativePath, fileName } = await import("./archiveStorage.ts").then((m) =>
        m.buildArchiveRelativePath(file.year, file.fileNumber, 1)
      );
      const existingCheck = await verifyArchivePdfIntegrity(relativePath, initialHash);
      if (existingCheck.isValid) {
        savedFile = {
          fileName,
          relativePath,
          absolutePath: "",
          fileSize,
          fileHash: initialHash,
          mimeType: "application/pdf",
          versionNumber: 1,
        };
      } else {
        const errMsg = `ملف الإصدار 1 موجود مسبقاً على القرص ولكن بـ Hash مختلف عن النسخة المعتمدة!`;
        await recordTransferFailure(localDb, transferId, errMsg);
        return {
          success: false,
          status: "FAILED",
          fileId: file.id,
          fileNumber: file.fileNumber,
          attemptCount,
          message: errMsg,
          error: "EXISTING_FILE_CORRUPTED",
          isRetryable: false,
        };
      }
    } else {
      const errMsg = `فشل حفظ ملف الـ PDF على القرص المحلي للأرشيف: ${saveErr.message}`;
      await recordTransferFailure(localDb, transferId, errMsg);
      return {
        success: false,
        status: "FAILED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        attemptCount,
        message: errMsg,
        error: saveErr.message,
        isRetryable: true,
      };
    }
  }

  // 11. إعادة قراءة الملف من القرص والتحقق الصارم من الـ Hash والحجم (Double-Check Integrity)
  try {
    const verifiedDiskBuffer = await readArchivePdf(savedFile.relativePath);
    const diskHash = computePdfHash(verifiedDiskBuffer);

    if (diskHash.toLowerCase() !== initialHash.toLowerCase()) {
      const errMsg = `فشل التحقق من صحة الملف: الـ Hash على القرص (${diskHash}) لا يطابق الـ Hash الأصلي (${initialHash})`;
      await recordTransferFailure(localDb, transferId, errMsg);
      return {
        success: false,
        status: "FAILED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        attemptCount,
        message: errMsg,
        error: "HASH_MISMATCH",
        isRetryable: true,
      };
    }

    if (verifiedDiskBuffer.length !== fileSize) {
      const errMsg = `فشل التحقق من حجم الملف: حجم القرص (${verifiedDiskBuffer.length}) لا يطابق الحجم الأصلي (${fileSize})`;
      await recordTransferFailure(localDb, transferId, errMsg);
      return {
        success: false,
        status: "FAILED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        attemptCount,
        message: errMsg,
        error: "SIZE_MISMATCH",
        isRetryable: true,
      };
    }
  } catch (verifyErr: any) {
    const errMsg = `فشل قراءة الملف والتحقق من سلامته بعد الحفظ: ${verifyErr.message}`;
    await recordTransferFailure(localDb, transferId, errMsg);
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount,
      message: errMsg,
      error: "INTEGRITY_VERIFICATION_FAILED",
      isRetryable: true,
    };
  }

  // 12. نقل بيانات المعاملة إلى Local MySQL وإنشاء سجل الأرشيف و Version 1
  try {
    // أ) التأكد من وجود سجل المعاملة incoming_files في Local MySQL لتلبية قيود المفاتيح الأجنبية
    const existingLocalFiles = await localDb
      .select({ id: incomingFiles.id })
      .from(incomingFiles)
      .where(eq(incomingFiles.id, file.id))
      .limit(1);

    if (existingLocalFiles.length === 0) {
      await localDb.insert(incomingFiles).values({
        id: file.id,
        fileNumber: file.fileNumber,
        year: file.year,
        arrivalDate: file.arrivalDate,
        sourceEntity: file.sourceEntity,
        fileType: file.fileType,
        subject: file.subject,
        importance: file.importance,
        status: "completed",
        originalFileKey: file.originalFileKey,
        originalFileUrl: file.originalFileUrl,
        originalFileName: file.originalFileName,
        originalMimeType: file.originalMimeType,
        signedFileKey: file.signedFileKey,
        signedFileUrl: file.signedFileUrl,
        isSigned: file.isSigned,
        signatureName: file.signatureName,
        signatureTitle: file.signatureTitle,
        signedAt: file.signedAt,
        signedInstruction: file.signedInstruction,
        assignedDepartment: file.assignedDepartment,
        assignedEmployee: file.assignedEmployee,
        directorInstruction: file.directorInstruction,
        notes: file.notes,
        dueDate: file.dueDate,
        registeredBy: file.registeredBy,
        currentResponsible: file.currentResponsible,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        directedAt: file.directedAt,
        completedAt: file.completedAt || new Date(),
      });
    }

    // ب) إنشاء سجل الأرشيف (archives) في Local MySQL
    const [archiveInsert] = await localDb.insert(archives).values({
      fileId: file.id,
      fileNumber: file.fileNumber,
      archivedAt: new Date(),
      archivedBy: actorName,
      status: "ARCHIVED",
      currentPdfVersion: 1,
      originalPdfVersion: 1,
      originalPdfHash: initialHash,
      currentPdfHash: initialHash,
      notes: file.notes || null,
    });
    const archiveId = (archiveInsert as any)?.insertId;

    // ج) إنشاء سجل الإصدار الأول (pdf_versions - Version 1)
    const [versionInsert] = await localDb.insert(pdfVersions).values({
      archiveId,
      fileId: file.id,
      versionNumber: 1,
      fileName: savedFile.fileName,
      filePath: savedFile.relativePath,
      mimeType: savedFile.mimeType,
      fileSize: savedFile.fileSize,
      fileHash: initialHash,
      createdBy: actorName,
      createdAt: new Date(),
      reason: "النسخة الرسمية المعتمدة والموقعة عند الترحيل الأولي للأرشيف",
      status: "ACTIVE",
      isCurrent: true,
    });
    const versionId = (versionInsert as any)?.insertId;

    // د) تسجيل العملية في سجل التدقيق audit_logs
    await localDb.insert(auditLogs).values({
      archiveId,
      fileId: file.id,
      userId: options.userId || null,
      username: actorName,
      action: "ARCHIVE_TRANSFER",
      tableName: "archives",
      recordId: String(archiveId),
      fieldName: "transfer_status",
      oldValue: "COMPLETED",
      newValue: "ARCHIVED",
      deviceInfo: "Local Archive Ingestion Agent v1.0",
    });

    // هـ) تحديث سجل الترحيل archive_transfers واعتباره COMPLETED
    if (transferId) {
      await localDb
        .update(archiveTransfers)
        .set({
          transferStatus: "COMPLETED",
          archiveId,
          pdfHash: initialHash,
          completedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(archiveTransfers.id, transferId));
    }

    return {
      success: true,
      status: "COMPLETED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      archiveId,
      versionId,
      pdfPath: savedFile.relativePath,
      pdfHash: initialHash,
      attemptCount,
      transferId,
      message: `تم ترحيل المعاملة (${file.fileNumber}) وحفظ الـ PDF الموقع في مجلد الأرشيف المحلي بنجاح تام وبإصدار Version 1`,
    };
  } catch (dbErr: any) {
    const errMsg = `فشل حفظ سجلات الأرشيف في قاعدة MySQL المحلية: ${dbErr?.message || "خطأ في قاعدة البيانات"}`;
    await recordTransferFailure(localDb, transferId, errMsg);
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount,
      message: errMsg,
      error: dbErr?.message,
      isRetryable: true,
    };
  }
}

/**
 * تسجيل فشل عملية الترحيل في جدول archive_transfers
 */
async function recordTransferFailure(
  localDb: any,
  transferId: number | undefined,
  errorMessage: string
) {
  if (!localDb || !transferId) return;
  try {
    await localDb
      .update(archiveTransfers)
      .set({
        transferStatus: "FAILED",
        errorMessage,
        lastAttemptAt: new Date(),
      })
      .where(eq(archiveTransfers.id, transferId));
  } catch (e) {
    console.warn("[ArchiveTransfer] Could not record transfer failure in DB:", e);
  }
}

/**
 * الاستعلام عن حالة ترحيل معاملة معينة
 */
export async function getArchiveTransferStatus(
  fileId: number,
  overrideLocalDb?: any
): Promise<{
  isArchived: boolean;
  status: string;
  attemptCount: number;
  lastAttemptAt?: Date | null;
  errorMessage?: string | null;
  archiveId?: number | null;
  pdfHash?: string | null;
}> {
  const localDb = overrideLocalDb || getLocalDb();
  if (!localDb) {
    return {
      isArchived: false,
      status: "LOCAL_MYSQL_NOT_CONFIGURED",
      attemptCount: 0,
      errorMessage: "قاعدة MySQL المحلية غير مهيأة",
    };
  }

  try {
    const archiveRecord = await localDb
      .select()
      .from(archives)
      .where(eq(archives.fileId, fileId))
      .limit(1);

    if (archiveRecord.length > 0) {
      return {
        isArchived: true,
        status: "COMPLETED",
        attemptCount: 1,
        archiveId: archiveRecord[0].id,
        pdfHash: archiveRecord[0].currentPdfHash,
      };
    }

    const transfer = await localDb
      .select()
      .from(archiveTransfers)
      .where(eq(archiveTransfers.fileId, fileId))
      .orderBy(desc(archiveTransfers.id))
      .limit(1);

    if (transfer.length > 0) {
      return {
        isArchived: transfer[0].transferStatus === "COMPLETED",
        status: transfer[0].transferStatus,
        attemptCount: transfer[0].attemptCount,
        lastAttemptAt: transfer[0].lastAttemptAt,
        errorMessage: transfer[0].errorMessage,
        archiveId: transfer[0].archiveId,
        pdfHash: transfer[0].pdfHash,
      };
    }

    return {
      isArchived: false,
      status: "NOT_TRANSFERRED",
      attemptCount: 0,
    };
  } catch (err: any) {
    return {
      isArchived: false,
      status: "ERROR",
      attemptCount: 0,
      errorMessage: err?.message,
    };
  }
}
