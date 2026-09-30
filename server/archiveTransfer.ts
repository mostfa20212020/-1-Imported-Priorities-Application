import { eq, desc, and } from "drizzle-orm";
import { getIncomingFile, getFileHistory } from "./db.ts";
import { getFileBytes } from "./storage.ts";
import {
  computePdfHash,
  saveArchivePdfVersion,
  verifyArchivePdfIntegrity,
  readArchivePdf,
  buildArchiveRelativePath,
} from "./archiveStorage.ts";
import { getLocalDb } from "../src/db/localMysql.ts";
import {
  archives,
  pdfVersions,
  auditLogs,
  archiveTransfers,
  incomingFiles,
  fileHistory,
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
  isRecovered?: boolean;
}

export interface TransferOptions {
  actorName?: string;
  userId?: number;
  overrideLocalDb?: any;
  overridePdfBytes?: Buffer;
}

export interface ArchiveIntegrityCheck {
  isFullyArchived: boolean;
  archiveRecord: any | null;
  pdfVersionRecord: any | null;
  incomingFileRecord: any | null;
  fileHistoryCount: number;
  transferRecord: any | null;
  diskFileValid: boolean;
  diskFileError?: string;
  missingParts: string[];
}

/**
 * فحص شامل لسلامة واكتمال حالة الأرشفة للمعاملة في Local MySQL والقرص
 * يمنع اعتبار المعاملة ALREADY_ARCHIVED إلا إذا كانت جميع الأجزاء الـ 8 متوفرة وسليمة 100%
 */
export async function checkArchiveIntegrity(
  localDb: any,
  file: NonNullable<Awaited<ReturnType<typeof getIncomingFile>>>,
  expectedPdfHash: string
): Promise<ArchiveIntegrityCheck> {
  const missingParts: string[] = [];

  // 1. فحص وجود سجل الأرشيف archives
  let archiveRecord: any = null;
  try {
    const res = await localDb
      .select()
      .from(archives)
      .where(eq(archives.fileId, file.id))
      .limit(1);
    if (res.length > 0) archiveRecord = res[0];
  } catch (err: any) {
    missingParts.push(`archives_query_error: ${err.message}`);
  }

  if (!archiveRecord) {
    missingParts.push("archive_record_missing");
  } else if (archiveRecord.status !== "ARCHIVED") {
    missingParts.push("archive_status_not_archived");
  } else if (
    archiveRecord.currentPdfHash &&
    archiveRecord.currentPdfHash.toLowerCase() !== expectedPdfHash.toLowerCase()
  ) {
    missingParts.push("archive_pdf_hash_mismatch");
  }

  // 2. فحص وجود سجل Version 1 في pdf_versions
  let pdfVersionRecord: any = null;
  try {
    const res = await localDb
      .select()
      .from(pdfVersions)
      .where(and(eq(pdfVersions.fileId, file.id), eq(pdfVersions.versionNumber, 1)))
      .limit(1);
    if (res.length > 0) pdfVersionRecord = res[0];
  } catch (err: any) {
    missingParts.push(`pdf_versions_query_error: ${err.message}`);
  }

  if (!pdfVersionRecord) {
    missingParts.push("pdf_version_1_missing");
  } else if (pdfVersionRecord.fileHash.toLowerCase() !== expectedPdfHash.toLowerCase()) {
    missingParts.push("pdf_version_hash_mismatch");
  } else if (pdfVersionRecord.fileSize <= 0) {
    missingParts.push("pdf_version_invalid_file_size");
  }

  // 3. فحص وجود الملف الفعلي على القرص المحلي ومطابقة SHA-256
  const { relativePath } = buildArchiveRelativePath(file.year, file.fileNumber, 1);
  let diskFileValid = false;
  let diskFileError: string | undefined;

  try {
    const diskCheck = await verifyArchivePdfIntegrity(relativePath, expectedPdfHash);
    if (diskCheck.isValid) {
      diskFileValid = true;
    } else {
      diskFileError = diskCheck.error;
      missingParts.push(`disk_pdf_${diskCheck.error || "invalid"}`);
    }
  } catch (err: any) {
    diskFileError = err.message;
    missingParts.push(`disk_pdf_read_error: ${err.message}`);
  }

  // 4. فحص وجود سجل المعاملة التشغيلي في incoming_files في Local MySQL
  let incomingFileRecord: any = null;
  try {
    const res = await localDb
      .select()
      .from(incomingFiles)
      .where(eq(incomingFiles.id, file.id))
      .limit(1);
    if (res.length > 0) incomingFileRecord = res[0];
  } catch {
    // optional
  }
  if (!incomingFileRecord) {
    missingParts.push("incoming_file_snapshot_missing");
  }

  // 5. فحص وجود سجل الحركات والتوجيهات file_history في Local MySQL
  let fileHistoryCount = 0;
  try {
    const res = await localDb
      .select()
      .from(fileHistory)
      .where(eq(fileHistory.fileId, file.id));
    fileHistoryCount = res.length;
  } catch {
    // optional
  }
  const cloudHistory = await getFileHistory(file.id);
  if (cloudHistory.length > 0 && fileHistoryCount < cloudHistory.length) {
    missingParts.push("file_history_incomplete");
  }

  // 6. فحص سجل الترحيل archive_transfers
  let transferRecord: any = null;
  try {
    const res = await localDb
      .select()
      .from(archiveTransfers)
      .where(eq(archiveTransfers.fileId, file.id))
      .orderBy(desc(archiveTransfers.id))
      .limit(1);
    if (res.length > 0) transferRecord = res[0];
  } catch {
    // optional
  }
  if (!transferRecord || transferRecord.transferStatus !== "COMPLETED") {
    missingParts.push("transfer_status_not_completed");
  } else if (
    transferRecord.pdfHash &&
    transferRecord.pdfHash.toLowerCase() !== expectedPdfHash.toLowerCase()
  ) {
    missingParts.push("transfer_pdf_hash_mismatch");
  }

  const isFullyArchived = missingParts.length === 0 && diskFileValid;

  return {
    isFullyArchived,
    archiveRecord,
    pdfVersionRecord,
    incomingFileRecord,
    fileHistoryCount,
    transferRecord,
    diskFileValid,
    diskFileError,
    missingParts,
  };
}

/**
 * دالة الترحيل والاستئناف (Transfer & Recovery) من Cloud SQL إلى Local MySQL
 * مع دعم Transactions الكامل، والـ Idempotency الصارمة، ونقل التاريخ وسجل العمليات
 */
export async function transferTransactionToLocalArchive(
  fileId: number,
  options: TransferOptions = {}
): Promise<TransferResult> {
  const actorName = options.actorName || "نظام الترحيل الآلي";

  // 1. قراءة بيانات المعاملة الرسمية من Cloud SQL MySQL
  const file = await getIncomingFile(fileId);
  if (!file) {
    return {
      success: false,
      status: "FAILED",
      fileId,
      fileNumber: `ID-${fileId}`,
      attemptCount: 0,
      message: `المعاملة رقم (${fileId}) غير موجودة في Cloud SQL MySQL`,
      error: "FILE_NOT_FOUND",
      isRetryable: false,
    };
  }

  // 2. التحقق من اكتمال المعاملة بالكامل
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
      message: `المعاملة غير مكتملة (حالتها الحالية: ${file.status}). يجب اكتمال كافة الإجراءات وتوقيع النائب العام قبل الترحيل.`,
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
      message: "ملف الـ PDF النهائي الموقع إلكترونياً غير موجود في سجل المعاملة",
      error: "SIGNED_PDF_MISSING",
      isRetryable: false,
    };
  }

  // 4. التحقق من توفر وتهيئة اتصال Local MySQL
  const localDb = options.overrideLocalDb || getLocalDb();
  if (!localDb) {
    return {
      success: false,
      status: "LOCAL_MYSQL_NOT_CONFIGURED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 0,
      message:
        "قاعدة بيانات MySQL المحلية غير مهيأة (LOCAL_MYSQL_NOT_CONFIGURED). يرجى ضبط المتغيرات في البيئة.",
      error: "LOCAL_MYSQL_NOT_CONFIGURED",
      isRetryable: true,
    };
  }

  // 5. استرجاع وقراءة الـ PDF النهائي من نظام التخزين الحالي (server/storage.ts)
  let pdfBuffer: Buffer | null = null;
  if (options.overridePdfBytes) {
    pdfBuffer = options.overridePdfBytes;
  } else if (pdfKey) {
    try {
      pdfBuffer = await getFileBytes(pdfKey);
    } catch (readErr: any) {
      return {
        success: false,
        status: "FAILED",
        fileId: file.id,
        fileNumber: file.fileNumber,
        attemptCount: 1,
        message: `فشل استرجاع ملف الـ PDF من التخزين: ${readErr?.message || "خطأ في التخزين"}`,
        error: "STORAGE_READ_ERROR",
        isRetryable: true,
      };
    }
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 1,
      message: "محتوى ملف الـ PDF فارغ أو غير متوفر في نظام التخزين",
      error: "EMPTY_PDF_CONTENT",
      isRetryable: true,
    };
  }

  // 6. التحقق من صحة ترويسة ملف الـ PDF (%PDF-)
  const pdfHeader = pdfBuffer.subarray(0, 5).toString("ascii");
  if (!pdfHeader.startsWith("%PDF-")) {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: 1,
      message: "محتوى الملف تالف أو لا يمثل وثيقة PDF صالحة (مفقود %PDF-)",
      error: "INVALID_PDF_FORMAT",
      isRetryable: false,
    };
  }

  // 7. حساب البصمة الرقمية المعتمدة SHA-256 للمستند وحجم الملف
  const expectedPdfHash = computePdfHash(pdfBuffer);
  const fileSize = pdfBuffer.length;

  // 8. فحص النزاهة الشامل وحالة الترحيل الحالية (Idempotency & Partial Failure Detection)
  let integrity: ArchiveIntegrityCheck;
  try {
    integrity = await checkArchiveIntegrity(localDb, file, expectedPdfHash);
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

  // إذا كانت المعاملة مؤرشفة بالكامل وبكل عناصرها دون أي نقص
  if (integrity.isFullyArchived) {
    return {
      success: true,
      status: "ALREADY_ARCHIVED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      archiveId: integrity.archiveRecord?.id,
      versionId: integrity.pdfVersionRecord?.id,
      pdfPath: integrity.pdfVersionRecord?.filePath,
      pdfHash: integrity.pdfVersionRecord?.fileHash || expectedPdfHash,
      attemptCount: integrity.transferRecord?.attemptCount || 1,
      transferId: integrity.transferRecord?.id,
      message: `المعاملة (${file.fileNumber}) مؤرشفة بالكامل ومحققة النزاهة مسبقاً في Local MySQL (معرف الأرشيف: ${integrity.archiveRecord?.id}). لن يتم تكرار الترحيل.`,
    };
  }

  // إذا وجد ملف على القرص ولكن الـ Hash غير مطابق (تلف أو عبث)
  if (integrity.diskFileError === "HASH_MISMATCH") {
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount: (integrity.transferRecord?.attemptCount || 0) + 1,
      message: "فشل التحقق من سلامة الملف: بصمة الـ PDF على القرص لا تطابق البصمة الرسمية المعتمدة (HASH_MISMATCH)",
      error: "HASH_MISMATCH",
      isRetryable: false,
    };
  }

  // تحديد ما إذا كانت هذه المحاولة استئناف لعملية سابقة غير مكتملة (Recovery)
  const isRecovery = Boolean(
    integrity.archiveRecord ||
    integrity.transferRecord ||
    integrity.diskFileValid ||
    integrity.pdfVersionRecord
  );

  const attemptCount = (integrity.transferRecord?.attemptCount || 0) + 1;
  let transferId = integrity.transferRecord?.id;

  // 9. تهيئة أو تحديث سجل تتبع الترحيل archive_transfers بحالة TRANSFERRING / RETRYING
  try {
    if (transferId) {
      await localDb
        .update(archiveTransfers)
        .set({
          transferStatus: isRecovery ? "RETRYING" : "TRANSFERRING",
          attemptCount,
          lastAttemptAt: new Date(),
          errorMessage: null,
        })
        .where(eq(archiveTransfers.id, transferId));
    } else {
      const [insertRes] = await localDb.insert(archiveTransfers).values({
        fileId: file.id,
        transferStatus: "TRANSFERRING",
        attemptCount: 1,
        startedAt: new Date(),
        lastAttemptAt: new Date(),
        sourceReference: "cloud_sql_mysql",
        destinationReference: "local_mysql",
        pdfHash: expectedPdfHash,
      });
      transferId = (insertRes as any)?.insertId || (insertRes as any)?.id;
    }
  } catch (err: any) {
    console.warn("[ArchiveTransfer] Could not update transfer status in DB:", err);
  }

  // 10. حفظ ملف الـ PDF في مجلد الأرشيف المنظم على القرص المحلي (server/archiveStorage.ts)
  const { relativePath, fileName } = buildArchiveRelativePath(file.year, file.fileNumber, 1);
  let savedFile = {
    fileName,
    relativePath,
    fileSize,
    fileHash: expectedPdfHash,
    versionNumber: 1,
  };

  // إذا لم يكن الملف محفوظاً وسليماً بالفعل على القرص، نقوم بحفظه
  if (!integrity.diskFileValid) {
    try {
      const saveRes = await saveArchivePdfVersion({
        year: file.year,
        fileNumber: file.fileNumber,
        versionNumber: 1,
        pdfBuffer,
        allowOverwrite: false,
      });
      savedFile = {
        fileName: saveRes.fileName,
        relativePath: saveRes.relativePath,
        fileSize: saveRes.fileSize,
        fileHash: saveRes.fileHash,
        versionNumber: 1,
      };
    } catch (saveErr: any) {
      if (saveErr.message?.includes("موجود مسبقاً")) {
        // فحص الـ Hash للملف الموجود للتأكد من مطابقته
        const existingCheck = await verifyArchivePdfIntegrity(relativePath, expectedPdfHash);
        if (existingCheck.isValid) {
          savedFile = {
            fileName,
            relativePath,
            fileSize,
            fileHash: expectedPdfHash,
            versionNumber: 1,
          };
        } else {
          const errMsg = `ملف الإصدار 1 موجود مسبقاً على القرص ولكن بـ Hash غير مطابق (تلف في التخزين)!`;
          await recordTransferFailure(localDb, transferId, errMsg);
          return {
            success: false,
            status: "FAILED",
            fileId: file.id,
            fileNumber: file.fileNumber,
            attemptCount,
            message: errMsg,
            error: "HASH_MISMATCH",
            isRetryable: false,
          };
        }
      } else {
        const errMsg = `فشل حفظ ملف الـ PDF على القرص: ${saveErr.message}`;
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
  }

  // التحقق الحتمي المزدوج من الـ Hash والحجم بعد الحفظ على القرص
  try {
    const diskBuffer = await readArchivePdf(savedFile.relativePath);
    const diskHash = computePdfHash(diskBuffer);
    if (diskHash.toLowerCase() !== expectedPdfHash.toLowerCase()) {
      const errMsg = `فشل التحقق من نزاهة الملف على القرص: عدم تطابق الـ Hash (${diskHash} مقابل ${expectedPdfHash})`;
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
  } catch (verifyErr: any) {
    const errMsg = `فشل قراءة الملف والتحقق من سلامته: ${verifyErr.message}`;
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

  // 11. تنفيذ عمليات قاعدة البيانات داخل Database Transaction موحدة (Atomic Transaction)
  // تضمن عدم ترك أي بيانات معلقة عند حدوث أي خطأ (Rollback on failure)
  let archiveId: number = integrity.archiveRecord?.id || 0;
  let versionId: number = integrity.pdfVersionRecord?.id || 0;

  try {
    // جلب سجل الحركات والتاريخ الرسمي من Cloud SQL لنقله
    const cloudHistory = await getFileHistory(file.id);

    const executeInTransaction = async (tx: any) => {
      // أ) حفظ/تحديث نسخة المعاملة التشغيلية في incoming_files المحلية
      const existingLocalFile = await tx
        .select({ id: incomingFiles.id })
        .from(incomingFiles)
        .where(eq(incomingFiles.id, file.id))
        .limit(1);

      if (existingLocalFile.length === 0) {
        await tx.insert(incomingFiles).values({
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

      // ب) نقل سجل حركات وتوجيهات المعاملة (file_history) من Cloud SQL إلى Local MySQL
      // مع منع إدراج السجلات المكررة
      const existingLocalHistory = await tx
        .select()
        .from(fileHistory)
        .where(eq(fileHistory.fileId, file.id));

      const existingHistorySignatures = new Set(
        existingLocalHistory.map(
          (h: any) => `${h.actionType}_${new Date(h.createdAt).getTime()}`
        )
      );

      for (const h of cloudHistory) {
        const sig = `${h.actionType}_${new Date(h.createdAt).getTime()}`;
        if (!existingHistorySignatures.has(sig)) {
          await tx.insert(fileHistory).values({
            fileId: file.id,
            actorName: h.actorName,
            actionType: h.actionType,
            oldStatus: h.oldStatus,
            newStatus: h.newStatus,
            details: h.details,
            createdAt: h.createdAt,
          });
          existingHistorySignatures.add(sig);
        }
      }

      // ج) إنشاء أو استكمال سجل الأرشيف (archives) المستقل وغير المعتمد على cascade delete
      let existingArchive = integrity.archiveRecord;
      if (!existingArchive) {
        const found = await tx
          .select()
          .from(archives)
          .where(eq(archives.fileId, file.id))
          .limit(1);
        if (found.length > 0) existingArchive = found[0];
      }

      if (existingArchive) {
        archiveId = existingArchive.id;
        await tx
          .update(archives)
          .set({
            fileNumber: file.fileNumber,
            year: file.year,
            sourceEntity: file.sourceEntity,
            fileType: file.fileType,
            subject: file.subject,
            importance: file.importance,
            status: "ARCHIVED",
            currentPdfVersion: 1,
            originalPdfVersion: 1,
            originalPdfHash: expectedPdfHash,
            currentPdfHash: expectedPdfHash,
            notes: file.notes || null,
            signedInstruction: file.signedInstruction || null,
            directorInstruction: file.directorInstruction || null,
            assignedDepartment: file.assignedDepartment || null,
            assignedEmployee: file.assignedEmployee || null,
            updatedAt: new Date(),
          })
          .where(eq(archives.id, archiveId));
      } else {
        const [archiveInsert] = await tx.insert(archives).values({
          fileId: file.id,
          fileNumber: file.fileNumber,
          year: file.year,
          sourceEntity: file.sourceEntity,
          fileType: file.fileType,
          subject: file.subject,
          importance: file.importance,
          archivedAt: new Date(),
          archivedBy: actorName,
          status: "ARCHIVED",
          currentPdfVersion: 1,
          originalPdfVersion: 1,
          originalPdfHash: expectedPdfHash,
          currentPdfHash: expectedPdfHash,
          notes: file.notes || null,
          signedInstruction: file.signedInstruction || null,
          directorInstruction: file.directorInstruction || null,
          assignedDepartment: file.assignedDepartment || null,
          assignedEmployee: file.assignedEmployee || null,
        });
        archiveId = Number(
          (archiveInsert as any)?.insertId || (archiveInsert as any)?.id || 0
        );
      }

      // د) إنشاء أو استكمال سجل النسخة الأولى (pdf_versions - Version 1)
      let existingVersion = integrity.pdfVersionRecord;
      if (!existingVersion && archiveId) {
        const found = await tx
          .select()
          .from(pdfVersions)
          .where(and(eq(pdfVersions.archiveId, archiveId), eq(pdfVersions.versionNumber, 1)))
          .limit(1);
        if (found.length > 0) existingVersion = found[0];
      }

      if (existingVersion) {
        versionId = existingVersion.id;
        await tx
          .update(pdfVersions)
          .set({
            archiveId,
            fileId: file.id,
            versionNumber: 1,
            fileName: savedFile.fileName,
            filePath: savedFile.relativePath,
            mimeType: "application/pdf",
            fileSize: savedFile.fileSize,
            fileHash: expectedPdfHash,
            status: "ACTIVE",
            isCurrent: true,
          })
          .where(eq(pdfVersions.id, versionId));
      } else {
        const [versionInsert] = await tx.insert(pdfVersions).values({
          archiveId,
          fileId: file.id,
          versionNumber: 1,
          fileName: savedFile.fileName,
          filePath: savedFile.relativePath,
          mimeType: "application/pdf",
          fileSize: savedFile.fileSize,
          fileHash: expectedPdfHash,
          createdBy: actorName,
          createdAt: new Date(),
          reason: "النسخة الرسمية المعتمدة والموقعة عند الترحيل الأولي للأرشيف",
          status: "ACTIVE",
          isCurrent: true,
        });
        versionId = Number(
          (versionInsert as any)?.insertId || (versionInsert as any)?.id || 0
        );
      }

      // هـ) تسجيل حركة التدقيق والمراجعة في audit_logs
      await tx.insert(auditLogs).values({
        archiveId,
        fileId: file.id,
        userId: options.userId || null,
        username: actorName,
        action: isRecovery ? "ARCHIVE_RECOVERY" : "ARCHIVE_TRANSFER",
        tableName: "archives",
        recordId: String(archiveId),
        fieldName: "status",
        oldValue: isRecovery ? "PARTIAL_RECOVERY" : "COMPLETED",
        newValue: "ARCHIVED",
        deviceInfo: "Local Archive Ingestion Agent v2.5",
      });

      // التحقق الصارم والشامل قبل ترقية حالة الترحيل إلى COMPLETED (Requirement 11)
      if (!archiveId || archiveId <= 0) {
        throw new Error("فشل التحقق النهائي: معرف الأرشيف archiveId غير صالح");
      }
      if (!versionId || versionId <= 0) {
        throw new Error("فشل التحقق النهائي: معرف إصدار الـ PDF versionId غير صالح");
      }
      if (!savedFile.relativePath || savedFile.fileSize <= 0) {
        throw new Error("فشل التحقق النهائي: مسار أو حجم ملف الـ PDF غير صالح");
      }
      if (cloudHistory.length > 0) {
        const currentLocalHistory = await tx
          .select()
          .from(fileHistory)
          .where(eq(fileHistory.fileId, file.id));
        if (currentLocalHistory.length < cloudHistory.length) {
          throw new Error("فشل التحقق النهائي: لم يتم نقل كامل سجل تاريخ الإجراءات إلى Local MySQL");
        }
      }

      // و) تحديث سجل الترحيل archive_transfers واعتباره COMPLETED
      if (transferId) {
        await tx
          .update(archiveTransfers)
          .set({
            transferStatus: "COMPLETED",
            archiveId,
            pdfHash: expectedPdfHash,
            completedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(archiveTransfers.id, transferId));
      } else {
        const [transInsert] = await tx.insert(archiveTransfers).values({
          fileId: file.id,
          archiveId,
          transferStatus: "COMPLETED",
          attemptCount: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          lastAttemptAt: new Date(),
          sourceReference: "cloud_sql_mysql",
          destinationReference: "local_mysql",
          pdfHash: expectedPdfHash,
        });
        transferId = Number((transInsert as any)?.insertId || (transInsert as any)?.id || 0);
      }
    };

    // تنفيذ الـ Transaction إذا كان localDb يدعم الدالة transaction
    if (typeof localDb.transaction === "function") {
      await localDb.transaction(executeInTransaction);
    } else {
      await executeInTransaction(localDb);
    }

    return {
      success: true,
      status: "COMPLETED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      archiveId,
      versionId,
      pdfPath: savedFile.relativePath,
      pdfHash: expectedPdfHash,
      attemptCount,
      transferId,
      isRecovered: isRecovery,
      message: isRecovery
        ? `تم استكمال ترحيل وأرشفة المعاملة (${file.fileNumber}) واسترجاع النقص بنجاح (Recovery Completed).`
        : `تم ترحيل المعاملة (${file.fileNumber}) وحفظ الـ PDF الموقع في مجلد الأرشيف المحلي بنجاح وبإصدار Version 1.`,
    };
  } catch (txErr: any) {
    const errMsg = `فشل تنفيذ معامَلة الأرشفة في Local MySQL (Rollback triggered): ${txErr?.message || "خطأ في قاعدة البيانات"}`;
    await recordTransferFailure(localDb, transferId, errMsg);
    return {
      success: false,
      status: "FAILED",
      fileId: file.id,
      fileNumber: file.fileNumber,
      attemptCount,
      message: errMsg,
      error: txErr?.message,
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
 * الاستعلام عن حالة ترحيل معاملة معينة مع فحص النزاهة الشامل
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
  isPartial?: boolean;
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
    const file = await getIncomingFile(fileId);
    if (!file) {
      return {
        isArchived: false,
        status: "NOT_FOUND",
        attemptCount: 0,
        errorMessage: "المعاملة غير موجودة في Cloud SQL",
      };
    }

    const archiveRecord = await localDb
      .select()
      .from(archives)
      .where(eq(archives.fileId, fileId))
      .limit(1);

    const transfer = await localDb
      .select()
      .from(archiveTransfers)
      .where(eq(archiveTransfers.fileId, fileId))
      .orderBy(desc(archiveTransfers.id))
      .limit(1);

    const versionRecord = await localDb
      .select()
      .from(pdfVersions)
      .where(and(eq(pdfVersions.fileId, fileId), eq(pdfVersions.versionNumber, 1)))
      .limit(1);

    const hasArchive = archiveRecord.length > 0;
    const hasVersion = versionRecord.length > 0;
    const isCompleted = transfer[0]?.transferStatus === "COMPLETED";

    // إذا وُجد الأرشيف ولكن ينقصه النسخة أو لم يكتمل
    const isPartial = hasArchive && (!hasVersion || !isCompleted);

    if (hasArchive && hasVersion && isCompleted) {
      return {
        isArchived: true,
        status: "COMPLETED",
        attemptCount: transfer[0]?.attemptCount || 1,
        lastAttemptAt: transfer[0]?.lastAttemptAt,
        archiveId: archiveRecord[0].id,
        pdfHash: archiveRecord[0].currentPdfHash,
        isPartial: false,
      };
    }

    if (transfer.length > 0) {
      return {
        isArchived: false,
        status: transfer[0].transferStatus,
        attemptCount: transfer[0].attemptCount,
        lastAttemptAt: transfer[0].lastAttemptAt,
        errorMessage: transfer[0].errorMessage,
        archiveId: transfer[0].archiveId,
        pdfHash: transfer[0].pdfHash,
        isPartial,
      };
    }

    return {
      isArchived: false,
      status: "NOT_TRANSFERRED",
      attemptCount: 0,
      isPartial: false,
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
