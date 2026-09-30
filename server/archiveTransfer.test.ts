import { describe, expect, it, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  transferTransactionToLocalArchive,
  getArchiveTransferStatus,
} from "./archiveTransfer";
import { createIncomingFile, getIncomingFile, updateIncomingFile } from "./db";
import { storagePut } from "./storage";
import { computePdfHash, readArchivePdf } from "./archiveStorage";

function resolveTable(table: any): string {
  try {
    return getTableName(table);
  } catch {
    return typeof table === "string" ? table : (table?._?.name || "");
  }
}

/**
 * Mock Local MySQL Database implementation for isolated unit testing
 */
class MockLocalDb {
  incomingFilesTable: any[] = [];
  archivesTable: any[] = [];
  pdfVersionsTable: any[] = [];
  auditLogsTable: any[] = [];
  archiveTransfersTable: any[] = [];

  idCounters = {
    incomingFiles: 100,
    archives: 200,
    pdfVersions: 300,
    auditLogs: 400,
    archiveTransfers: 500,
  };

  select(selectFields?: any) {
    const self = this;
    return {
      from(table: any) {
        const tableName = resolveTable(table);
        return {
          where(condition: any) {
            let data: any[] = [];
            if (tableName === "archives") {
              data = self.archivesTable;
            } else if (tableName === "pdf_versions") {
              data = self.pdfVersionsTable;
            } else if (tableName === "archive_transfers") {
              data = self.archiveTransfersTable;
            } else if (tableName === "incoming_files") {
              data = self.incomingFilesTable;
            }

            let filtered = [...data];
            return {
              orderBy(...args: any[]) {
                return {
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
              limit(n: number) {
                return Promise.resolve([]);
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
            }
            return Promise.resolve([{ affectedRows: 1 }]);
          },
        };
      },
    };
  }
}

describe("Phase 3: Transfer System to Local MySQL & Archive", () => {
  const samplePdfBytes = Buffer.from(
    "%PDF-1.5\nSample prosecution official signed document for automated archive transfer testing\n%%EOF"
  );

  let mockLocalDb: MockLocalDb;

  beforeEach(() => {
    mockLocalDb = new MockLocalDb();
  });

  it("1. النجاح الكامل: ترحيل معاملة مكتملة وموقعة بنجاح إلى Local MySQL والأرشيف", async () => {
    // تجهيز معاملة مكتملة وموقعة
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
      subject: "قضية ترحيل مكتملة للاختبار",
      importance: "urgent",
      status: "completed",
      isSigned: true,
      signedFileKey: uploaded.key,
      signedFileUrl: uploaded.url,
      signatureName: "فضيلة القاضي النائب العام",
      signatureTitle: "النائب العام",
      completedAt: new Date(),
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      actorName: "مدير النظام للاختبار",
      overrideLocalDb: mockLocalDb,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.archiveId).toBeGreaterThan(0);
    expect(result.versionId).toBeGreaterThan(0);
    expect(result.pdfHash).toBe(computePdfHash(samplePdfBytes));
    expect(result.pdfPath).toContain("Version-1");

    // التحقق من إنشاء سجل الأرشيف في Local MySQL
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    expect(mockLocalDb.archivesTable[0].fileNumber).toBe(fileNum);
    expect(mockLocalDb.archivesTable[0].currentPdfVersion).toBe(1);

    // التحقق من إنشاء سجل الإصدار الأول pdf_versions
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
    expect(mockLocalDb.pdfVersionsTable[0].versionNumber).toBe(1);
    expect(mockLocalDb.pdfVersionsTable[0].fileHash).toBe(computePdfHash(samplePdfBytes));

    // التحقق من تسجيل العملية في audit_logs
    expect(mockLocalDb.auditLogsTable).toHaveLength(1);
    expect(mockLocalDb.auditLogsTable[0].action).toBe("ARCHIVE_TRANSFER");

    // التحقق من قراءة الملف من القرص ومطابقته
    const diskContent = await readArchivePdf(result.pdfPath!);
    expect(diskContent.toString()).toBe(samplePdfBytes.toString());
  });

  it("2. فشل الترحيل عند فقدان ملف الـ PDF الموقع (SIGNED_PDF_MISSING)", async () => {
    const fileNum = `TEST-NOPDF-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "هيئة الرقابة",
      fileType: "وارد مكاتبات",
      subject: "معاملة بدون مرفق موقع",
      importance: "normal",
      status: "completed",
      isSigned: false, // غير موقع ومفقود المرفق
      signedFileKey: undefined,
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("SIGNED_PDF_MISSING");
    // التأكد من عدم إنشاء أي سجل في الأرشيف
    expect(mockLocalDb.archivesTable).toHaveLength(0);
  });

  it("3. إرجاع LOCAL_MYSQL_NOT_CONFIGURED عند عدم توفر اتصال MySQL المحلية", async () => {
    const fileNum = `TEST-NOLOCAL-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "وزارة العدل",
      fileType: "وارد رئاسي",
      subject: "معاملة فحص انقطاع Local MySQL",
      importance: "urgent",
      status: "completed",
      isSigned: true,
      signedFileKey: "dummy-key",
    });

    // تمرير overrideLocalDb = null لمحاكاة عدم توفر Local MySQL
    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: null,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("LOCAL_MYSQL_NOT_CONFIGURED");
    expect(result.isRetryable).toBe(true);
  });

  it("4. منع الترحيل المكرر (Idempotency): إرجاع ALREADY_ARCHIVED وعدم إنشاء نسخة مكررة", async () => {
    const fileNum = `TEST-DUP-${Date.now()}`;
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
      signedFileKey: "any-key",
    });

    // المحاولة الأولى
    const res1 = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });
    expect(res1.status).toBe("COMPLETED");
    expect(mockLocalDb.archivesTable).toHaveLength(1);

    // المحاولة الثانية لنفس المعاملة
    const res2 = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(res2.success).toBe(true);
    expect(res2.status).toBe("ALREADY_ARCHIVED");
    // التأكد من عدم إضافة سجل ثانٍ في جدول archives
    expect(mockLocalDb.archivesTable).toHaveLength(1);
    // التأكد من عدم إضافة إصدار ثانٍ في جدول pdf_versions
    expect(mockLocalDb.pdfVersionsTable).toHaveLength(1);
  });

  it("5. رفض ترحيل معاملة غير مكتملة الإجراءات والتوجيه (TRANSACTION_NOT_COMPLETED)", async () => {
    const fileNum = `TEST-INCOMPLETE-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "إدارة التفتيش",
      fileType: "وارد خاص",
      subject: "معاملة قيد الإجراء لم تكتمل",
      importance: "normal",
      status: "in_progress", // لم تكتمل بعد
      isSigned: true,
    });

    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: samplePdfBytes,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("TRANSACTION_NOT_COMPLETED");
    expect(mockLocalDb.archivesTable).toHaveLength(0);
  });

  it("6. رفض ملف PDF تالف أو غير صالح (INVALID_PDF_FORMAT)", async () => {
    const fileNum = `TEST-CORRUPT-${Date.now()}`;
    const created = await createIncomingFile({
      fileNumber: fileNum,
      year: 2026,
      arrivalDate: new Date(),
      sourceEntity: "المحكمة العليا",
      fileType: "وارد عام",
      subject: "معاملة بملف تالف",
      importance: "urgent",
      status: "completed",
      isSigned: true,
    });

    const corruptBytes = Buffer.from("NOT_A_PDF_FILE_JUST_PLAIN_TEXT");
    const result = await transferTransactionToLocalArchive(created.id, {
      overrideLocalDb: mockLocalDb,
      overridePdfBytes: corruptBytes,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("INVALID_PDF_FORMAT");
    expect(mockLocalDb.archivesTable).toHaveLength(0);
  });
});
