import { describe, expect, it, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  transferTransactionToLocalArchive,
  getArchiveTransferStatus,
} from "./archiveTransfer";
import {
  createIncomingFile,
  getIncomingFile,
  updateIncomingFile,
  addFileHistory,
} from "./db";
import { storagePut } from "./storage";
import {
  computePdfHash,
  readArchivePdf,
  saveArchivePdfVersion,
  buildArchiveRelativePath,
} from "./archiveStorage";

function resolveTable(table: any): string {
  try {
    return getTableName(table);
  } catch {
    return typeof table === "string" ? table : table?._?.name || "";
  }
}

/**
 * Mock Local MySQL Database with full Transaction & Rollback simulation
 */
class MockLocalDb {
  incomingFilesTable: any[] = [];
  fileHistoryTable: any[] = [];
  archivesTable: any[] = [];
  pdfVersionsTable: any[] = [];
  auditLogsTable: any[] = [];
  archiveTransfersTable: any[] = [];

  idCounters = {
    incomingFiles: 100,
    fileHistory: 150,
    archives: 200,
    pdfVersions: 300,
    auditLogs: 400,
    archiveTransfers: 500,
  };

  failOnTransaction = false;
  failOnTableInsert: string | null = null;

  select(selectFields?: any) {
    const self = this;
    return {
      from(table: any) {
        const tableName = resolveTable(table);
        let data: any[] = [];
        if (tableName === "archives") {
          data = self.archivesTable;
        } else if (tableName === "pdf_versions") {
          data = self.pdfVersionsTable;
        } else if (tableName === "archive_transfers") {
          data = self.archiveTransfersTable;
        } else if (tableName === "incoming_files") {
          data = self.incomingFilesTable;
        } else if (tableName === "file_history") {
          data = self.fileHistoryTable;
        }

        return {
          then(onFulfilled?: any, onRejected?: any) {
            return Promise.resolve([...data]).then(onFulfilled, onRejected);
          },
          where(condition: any) {
            let filtered = [...data];
            return {
              then(onFulfilled?: any, onRejected?: any) {
                return Promise.resolve(filtered).then(onFulfilled, onRejected);
              },
              orderBy(...args: any[]) {
                return {
                  then(onFulfilled?: any, onRejected?: any) {
                    return Promise.resolve(filtered).then(onFulfilled, onRejected);
                  },
                  limit(n: number) {
                    return Promise.resolve(filtered.slice(0, n));
                  },
                };
              },
              limit(n: number) {
                return Promise.resolve(filtered.slice(0, n));
              },
            };
          },
          orderBy(...args: any[]) {
            return {
              then(onFulfilled?: any, onRejected?: any) {
                return Promise.resolve([...data]).then(onFulfilled, onRejected);
              },
              limit(n: number) {
                return Promise.resolve(data.slice(0, n));
              },
            };
          },
        };
      },
    };
  }

  insert(table: any) {
    const self = this;
    const tableName = resolveTable(table);
    if (self.failOnTableInsert && self.failOnTableInsert === tableName) {
      throw new Error(`Simulated database failure during insert into ${tableName}`);
    }
    return {
      values(vals: any) {
        let insertedId = 0;
        const record = { ...vals };
        if (tableName === "archives") {
          insertedId = ++self.idCounters.archives;
          record.id = insertedId;
          self.archivesTable.push(record);
        } else if (tableName === "pdf_versions") {
          insertedId = ++self.idCounters.pdfVersions;
          record.id = insertedId;
          self.pdfVersionsTable.push(record);
        } else if (tableName === "archive_transfers") {
          insertedId = ++self.idCounters.archiveTransfers;
          record.id = insertedId;
          self.archiveTransfersTable.push(record);
        } else if (tableName === "audit_logs") {
          insertedId = ++self.idCounters.auditLogs;
          record.id = insertedId;
          self.auditLogsTable.push(record);
        } else if (tableName === "incoming_files") {
          insertedId = ++self.idCounters.incomingFiles;
          record.id = insertedId;
          self.incomingFilesTable.push(record);
        } else if (tableName === "file_history") {
          insertedId = ++self.idCounters.fileHistory;
          record.id = insertedId;
          self.fileHistoryTable.push(record);
        }
        return Promise.resolve([{ insertId: insertedId }]);
      },
    };
  }

  update(table: any) {
    const self = this;
    const tableName = resolveTable(table);
    return {
      set(updates: any) {
        return {
          where(condition: any) {
            if (tableName === "archive_transfers") {
              for (const row of self.archiveTransfersTable) {
                Object.assign(row, updates);
              }
            } else if (tableName === "archives") {
              for (const row of self.archivesTable) {
                Object.assign(row, updates);
              }
            } else if (tableName === "pdf_versions") {
              for (const row of self.pdfVersionsTable) {
                Object.assign(row, updates);
              }
            }
            return Promise.resolve([{ affectedRows: 1 }]);
          },
        };
      },
    };
  }

  /**
   * محاكاة الـ Transaction مع دعم الـ Rollback عند حدوث خطأ
   */
  async transaction(callback: (tx: any) => Promise<any>) {
    if (this.failOnTransaction) {
      throw new Error("Simulated Local MySQL connection drop during transaction");
    }

    const snapshot = {
      incomingFiles: JSON.parse(JSON.stringify(this.incomingFilesTable)),
      fileHistory: JSON.parse(JSON.stringify(this.fileHistoryTable)),
      archives: JSON.parse(JSON.stringify(this.archivesTable)),
      pdfVersions: JSON.parse(JSON.stringify(this.pdfVersionsTable)),
      auditLogs: JSON.parse(JSON.stringify(this.auditLogsTable)),
      archiveTransfers: JSON.parse(JSON.stringify(this.archiveTransfersTable)),
    };

    try {
      return await callback(this);
    } catch (err) {
      // Rollback: استرجاع الحالة كما كانت قبل بدء المعاملة
      this.incomingFilesTable = snapshot.incomingFiles;
      this.fileHistoryTable = snapshot.fileHistory;
      this.archivesTable = snapshot.archives;
      this.pdfVersionsTable = snapshot.pdfVersions;
      this.auditLogsTable = snapshot.auditLogs;
      this.archiveTransfersTable = snapshot.archiveTransfers;
      throw err;
    }
  }
}

describe("Phase 3 Refinements: Transfer System, Recovery, Transactions & Integrity", () => {
  const samplePdfBytes = Buffer.from(
    "%PDF-1.5\nSample prosecution official signed document for automated archive transfer testing\n%%EOF"
  );

  let mockLocalDb: MockLocalDb;

  beforeEach(() => {
    mockLocalDb = new MockLocalDb();
  });

  it("الحالة 1 — نجاح كامل (Full Success): ترحيل معاملة مكتملة وموقعة بالكامل", async () => {
    const fileNum = `TEST-TRANSFER-${Date.now()}`;
    const uploaded = await storagePut(
      `incoming/signed/2026/${fileNum}.pdf`,
      samplePdfBytes,
      "application/pdf"
    );

    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "محكمة الاستئناف",
      fileType: "وارد عام",
      subject: "قضية ترحيل مكتملة للاختبار الشامل",
      importance: "urgent",
      status: "completed",
      isSigned: true,
      signedFileKey: uploaded.key,
      signedFileUrl: uploaded.url,
      signatureName: "فضيلة القاضي النائب العام",
      signatureTitle: "النائب العام",
      completedAt: new Date(),
    });

    await addFileHistory({
      fileId: created.id,
      actorName: "موظف الاستقبال",
      actionType: "تسجيل وارد",
      newStatus: "PENDING_AG",
      details: "تم تسجيل الوارد وإحالته",
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      actorName: "مدير الأرشيف",
      overrideLocalDb: mockLocalDb,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.archiveId).toBeGreaterThan(0);
    expect(result.versionId).toBeGreaterThan(0);
    expect(result.pdfHash).toBe(computePdfHash(samplePdfBytes));

    // التحقق من نقل التاريخ والسجلات
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.archivesTable[0].fileNumber).toBe(fileNum);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable[0].versionNumber).toBe(1);
    expect(mockLocalDb.fileHistoryTable).toHaveLength(1);
    expect(mockLocalDb.auditLogsTable).toHaveLength(1);

    // التحقق من قراءة الملف من القرص ومطابقته
    const diskContent = await readArchivePdf(result.pdfPath!);
    expect(diskContent.toString()).toBe(samplePdfBytes.toString());
  });

  it("الحالة 2 — إعادة نفس العملية (Idempotency): إرجاع ALREADY_ARCHIVED دون إنشاء بيانات مكررة", async () => {
    const fileNum = `TEST-IDEMP-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "النيابة الجزائية",
      fileType: "وارد عام",
      subject: "معاملة لفحص منع التكرار",
      importance: "normal",
      status: "completed",
      isSigned: true,
      signedFileKey: "key-1",
    });

    // المحاولة الأولى
    const res1 = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });
    expect(res1.status).toBe("COMPLETED");
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);

    // المحاولة الثانية لنفس المعاملة المؤرشفة مسبقاً
    const res2 = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(res2.success).toBe(true);
    expect(res2.status).toBe("ALREADY_ARCHIVED");
    // منع تكرار السجلات
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("الحالة 3 — استرجاع الترحيل الجزئي (Partial Transfer Recovery): استكمال النقص دون إنشاء أرشيف جديد", async () => {
    const fileNum = `TEST-RECOVER-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "وزارة الداخلية",
      fileType: "وارد مكاتبات",
      subject: "معاملة حدث فيها انقطاع جزئي",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    // محاكاة حالة جزئية: وُجد سجل archives ولكن ينقصه سجل pdf_versions أو ينقصه سجل التحويل
    mockLocalDb.archivesTable.push({
      id: 999,
      fileId: created.id,
      fileNumber: fileNum,
      status: "ARCHIVED",
      originalPdfHash: computePdfHash(samplePdfBytes),
      currentPdfHash: computePdfHash(samplePdfBytes),
    });

    // عند تشغيل الترحيل يجب ألا يعطي ALREADY_ARCHIVED لأن النسخة ناقصة، بل يقوم بعمل RECOVER واستكمال النقص
    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.isRecovered).toBe(true);
    // التأكد من عدم إنشاء سجل archives جديد (يظل 1 فقط)
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    // تم استكمال النسخة pdf_versions
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable[0].versionNumber).toBe(1);
  });

  it("الحالة 4 — التحقق من سلامة البصمة: رفض الترحيل عند عدم تطابق الـ Hash (HASH_MISMATCH)", async () => {
    const fileNum = `TEST-HASHMISMATCH-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة العليا",
      fileType: "وارد عام",
      subject: "معاملة فحص تلف الـ Hash",
      importance: "normal",
      status: "completed",
      isSigned: true,
    });

    // حفظ ملف مسبق على القرص بمحتوى مختلف لنفس المسار
    const { relativePath } = buildArchiveRelativePath(2026, fileNum, 1);
    const conflictingBytes = Buffer.from("%PDF-1.5\nTotally Different Corrupted Content\n%%EOF");
    await saveArchivePdfVersion({
      year: 2026,
      fileNumber: fileNum,
      versionNumber: 1,
      pdfBuffer: conflictingBytes,
      allowOverwrite: true,
    });

    // محاولة ترحيل المعاملة مع ملف رسمي يختلف عن المحفوظ مسبقاً
    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("HASH_MISMATCH");
  });

  it("الحالة 5 — انقطاع Local MySQL وتفعيل الـ Rollback مع إمكانية إعادة المحاولة بنجاح", async () => {
    const fileNum = `TEST-ROLLBACK-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "نيابة الأموال العامة",
      fileType: "وارد خاص",
      subject: "فحص Rollback المعاملات",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    // تفعيل فشل المعاملة في قاعدة البيانات
    mockLocalDb.failOnTransaction = true;

    const failResult = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(failResult.success).toBe(false);
    expect(failResult.status).toBe("FAILED");
    expect(failResult.isRetryable).toBe(true);

    // التحقق من أن الـ Rollback منع ترك أي سجل معلق في archives أو pdf_versions
    expect(mockLocalDb.archivesTable).toHaveLength(0);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(0);

    // إعادة المحاولة بعد إصلاح الاتصال
    mockLocalDb.failOnTransaction = false;
    const retryResult = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(retryResult.success).toBe(true);
    expect(retryResult.status).toBe("COMPLETED");
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("الحالة 6 — حفظ الـ PDF ثم فشل MySQL: الاستئناف يكتشف الـ PDF الموجود دون مضاعفة الملفات", async () => {
    const fileNum = `TEST-PDFFIRST-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة الإدارية",
      fileType: "وارد عام",
      subject: "فحص حفظ الـ PDF أولاً",
      importance: "normal",
      status: "completed",
      isSigned: true,
    });

    // حفظ الـ PDF مسبقاً على القرص
    await saveArchivePdfVersion({
      year: 2026,
      fileNumber: fileNum,
      versionNumber: 1,
      pdfBuffer: samplePdfBytes,
      allowOverwrite: true,
    });

    // تشغيل الترحيل: يجب أن يكتشف الملف السليم على القرص دون أن يلقي خطأ "الملف موجود مسبقاً"
    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("الحالة 7 — نقل كامل لتاريخ الإجراءات (File History) إلى Local MySQL", async () => {
    const fileNum = `TEST-HISTORY-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "رئاسة الجمهورية",
      fileType: "وارد رئاسي",
      subject: "معاملة ذات مسار تاريخي متعدد",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    // إضافة عدة حركات في السجل
    await addFileHistory({
      fileId: created.id,
      actorName: "موظف الاستقبال",
      actionType: "استلام المعاملة",
      newStatus: "PENDING_AG",
      details: "تسجيل أوليات المعاملة",
    });

    await addFileHistory({
      fileId: created.id,
      actorName: "فضيلة النائب العام",
      actionType: "توجيه وتوقيع إلكتروني",
      oldStatus: "PENDING_AG",
      newStatus: "PENDING_EMPLOYEE",
      details: "إحالة للمختص للتنفيذ الفوري",
    });

    await addFileHistory({
      fileId: created.id,
      actorName: "الموظف المختص",
      actionType: "اكتمال الإجراءات والترحيل",
      oldStatus: "PENDING_EMPLOYEE",
      newStatus: "COMPLETED",
      details: "استيفاء كامل المتطلبات",
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(true);
    // التأكد من نقل جميع الحركات الـ 3 إلى جدول fileHistory في Local MySQL
    expect(mockLocalDb.fileHistoryTable).toHaveLength(3);
    expect(mockLocalDb.fileHistoryTable.map((h) => h.actionType)).toContain("استلام المعاملة");
    expect(mockLocalDb.fileHistoryTable.map((h) => h.actionType)).toContain("توجيه وتوقيع إلكتروني");
    expect(mockLocalDb.fileHistoryTable.map((h) => h.actionType)).toContain("اكتمال الإجراءات والترحيل");
  });

  it("الحالة 8 — التحقق من عدم المساس بالسجل السحابي (No Cloud Deletion)", async () => {
    const fileNum = `TEST-NOCLOUD-DEL-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة التجارية",
      fileType: "وارد عام",
      subject: "معاملة للتحقق من بقاء السجل السحابي",
      importance: "normal",
      status: "completed",
      isSigned: true,
      originalFileKey: "cloud-original-key",
      signedFileKey: "cloud-signed-key",
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(true);

    // التأكد التام من أن سجل المعاملة في Cloud SQL ما زال موجوداً ومكتمل البيانات ولم يُحذف
    const cloudFile = await getIncomingFile(created.id);
    expect(cloudFile).not.toBeNull();
    expect(cloudFile?.id).toBe(created.id);
    expect(cloudFile?.fileNumber).toBe(fileNum);
    expect(cloudFile?.signedFileKey).toBe("cloud-signed-key");
  });

  it("الحالة 9 — وجود بيانات في MySQL مع فشل الـ PDF: لا تعتبر العملية COMPLETED بل قابلة للاستكمال", async () => {
    const fileNum = `TEST-MYSQL-FIRST-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة الابتدائية",
      fileType: "وارد عام",
      subject: "فحص حالة بيانات MySQL موجودة وPDF يفشل",
      importance: "normal",
      status: "completed",
      isSigned: true,
    });

    // محاكاة حالة وجود بيانات أرشيف مسبقاً في Local MySQL
    mockLocalDb.archivesTable.push({
      id: 888,
      fileId: created.id,
      fileNumber: fileNum,
      year: 2026,
      status: "ARCHIVED",
      currentPdfVersion: 1,
      originalPdfHash: computePdfHash(samplePdfBytes),
      currentPdfHash: computePdfHash(samplePdfBytes),
    });

    // محاولة الترحيل مع ملف PDF تالف أو غير صالح (لا يبدأ بـ %PDF-)
    const corruptedPdfBytes = Buffer.from("NOT_A_VALID_PDF_FILE");
    const failResult = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: corruptedPdfBytes,
    });

    // التحقق: لا تعتبر العملية COMPLETED بل فشلت لعدم صلاحية الـ PDF
    expect(failResult.success).toBe(false);
    expect(failResult.status).toBe("FAILED");
    expect(failResult.error).toBe("INVALID_PDF_FORMAT");

    // استكمال العملية عند توفير الـ PDF السليم
    const successResult = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(successResult.success).toBe(true);
    expect(successResult.status).toBe("COMPLETED");
    expect(successResult.isRecovered).toBe(true);
    // التأكد من عدم تكرار سجل الـ archives (يبقى 1 فقط)
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("الحالة 10 — [متطلب المستخدم 1] PDF يُحفظ بنجاح ثم تفشل MySQL: الاستئناف (Recovery) يكمل العملية دون إنشاء نسخة ثانية", async () => {
    const fileNum = `TEST-PDF-THEN-FAIL-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة العليا - الدائرة الجزائية",
      fileType: "وارد قضائي",
      subject: "اختبار حفظ PDF أولاً ثم فشل قاعدة بيانات MySQL واستئناف العملية",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    // 1. تفعيل انقطاع MySQL أثناء تنفيذ الـ Transaction
    mockLocalDb.failOnTransaction = true;

    // محاولة الترحيل الأولى: سيتم حفظ الـ PDF على القرص ثم يفشل الـ Transaction في MySQL
    const firstAttempt = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    // التحقق من فشل العملية الأولى برمز FAILED وقابليتها للإعادة
    expect(firstAttempt.success).toBe(false);
    expect(firstAttempt.status).toBe("FAILED");
    expect(firstAttempt.isRetryable).toBe(true);

    // التحقق من أن ملف الـ PDF تم حفظه بنجاح على القرص وبصمته سليمة تماماً
    const { relativePath } = buildArchiveRelativePath(2026, fileNum, 1);
    const diskContent = await readArchivePdf(relativePath);
    expect(diskContent).toBeDefined();
    expect(computePdfHash(diskContent)).toBe(computePdfHash(samplePdfBytes));

    // التحقق من أن قاعدة MySQL لم يُسجل فيها أي بيانات بسبب الـ Rollback
    expect(mockLocalDb.archivesTable).toHaveLength(0);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(0);

    // 2. إصلاح الاتصال بقاعدة MySQL ثم تشغيل الاستئناف (Recovery)
    mockLocalDb.failOnTransaction = false;

    const recoveryAttempt = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    // التحقق من نجاح الاستئناف واكتمال المعاملة
    expect(recoveryAttempt.success).toBe(true);
    expect(recoveryAttempt.status).toBe("COMPLETED");

    // التأكد من عدم إنشاء ملف أو نسخة ثانية: يجب أن تظل Version 1 فقط
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.archivesTable[0].fileNumber).toBe(fileNum);
    expect(mockLocalDb.archivesTable[0].currentPdfVersion).toBe(1);

    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable[0].versionNumber).toBe(1);

    // محاولة ثالثة بعد الاكتمال: يجب أن تعيد ALREADY_ARCHIVED فوراً دون تكرار أي سجل أو ملف
    const thirdAttempt = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });
    expect(thirdAttempt.success).toBe(true);
    expect(thirdAttempt.status).toBe("ALREADY_ARCHIVED");
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("الحالة 11 — [متطلب المستخدم 2] MySQL Transaction تفشل في المنتصف قبل الإكمال: لا تعتبر العملية COMPLETED، ثم تنجح عند Retry", async () => {
    const fileNum = `TEST-TX-PARTIAL-FAIL-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "نيابة الأموال العامة المركزية",
      fileType: "وارد تحقيقات",
      subject: "اختبار فشل المعاملة في المنتصف وعدم اعتبارها مكتملة حتى تنجح بالكامل",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    // إضافة حركات في السجل لترحيلها
    await addFileHistory({
      fileId: created.id,
      actorName: "المحقق",
      actionType: "إجراء تحقيق",
      newStatus: "PENDING_AG",
      details: "استكمال التحقيق وإحالة للتوقيع",
    });

    // 1. محاكاة فشل في منتصف الـ Transaction عند إدراج سجلات التدقيق audit_logs
    mockLocalDb.failOnTableInsert = "audit_logs";

    const partialFailAttempt = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    // التحقق الصارم: لا تعتبر العملية COMPLETED مطلقاً
    expect(partialFailAttempt.success).toBe(false);
    expect(partialFailAttempt.status).toBe("FAILED");
    expect(partialFailAttempt.status).not.toBe("COMPLETED");

    // التحقق من تفعيل Rollback وعدم بقاء أي سجل نصف مكتمل في archives أو pdf_versions
    expect(mockLocalDb.archivesTable).toHaveLength(0);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(0);

    // التحقق من أن حالة سجل الترحيل archive_transfers مسجلة FAILED وليست COMPLETED
    const latestTransfer = mockLocalDb.archiveTransfersTable[mockLocalDb.archiveTransfersTable.length - 1];
    expect(latestTransfer).toBeDefined();
    expect(latestTransfer.transferStatus).toBe("FAILED");
    expect(latestTransfer.transferStatus).not.toBe("COMPLETED");

    // التحقق من دالة الاستعلام getArchiveTransferStatus بأن المعاملة غير مكتملة
    const statusBeforeRetry = await getArchiveTransferStatus(created.id, mockLocalDb);
    expect(statusBeforeRetry.isArchived).toBe(false);
    expect(statusBeforeRetry.status).not.toBe("COMPLETED");

    // 2. إزالة سبب الفشل وإعادة المحاولة (Retry)
    mockLocalDb.failOnTableInsert = null;

    const retryAttempt = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    // التحقق من نجاح المحاولة بالكامل
    expect(retryAttempt.success).toBe(true);
    expect(retryAttempt.status).toBe("COMPLETED");

    // التحقق من اكتمال كافة الجداول بعد الـ Retry
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
    expect(mockLocalDb.auditLogsTable).toHaveLength(1);
    expect(mockLocalDb.fileHistoryTable).toHaveLength(1);

    // التحقق من ترقية حالة الترحيل إلى COMPLETED
    const statusAfterRetry = await getArchiveTransferStatus(created.id, mockLocalDb);
    expect(statusAfterRetry.isArchived).toBe(true);
    expect(statusAfterRetry.status).toBe("COMPLETED");
  });
});
