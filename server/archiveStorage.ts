import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

/**
 * دالة حساب الـ Hash (SHA-256) من محتوى مستند الـ PDF
 * للتحقق من سلامة وعدم التلاعب بالملف المخزن على القرص
 */
export function computePdfHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * تنظيف وتنسيق رقم المعاملة ليكون صالحاً كاسم مجلد وملف آمن عبر أنظمة التشغيل (Windows/Linux)
 * مثال: '2026/101' -> '2026-101'
 */
export function sanitizeFileNumber(fileNumber: string): string {
  return fileNumber.trim().replace(/[\/\\?%*:|"<> ]+/g, "-");
}

/**
 * الحصول على مسار جذر مجلد الأرشيف القابل للإعداد عبر Environment Variable
 * القيمة الافتراضية: 'Archive' داخل مجلد العمل
 */
export function getArchiveRootPath(): string {
  const custom = ENV.archiveRootPath;
  if (path.isAbsolute(custom)) {
    return custom;
  }
  return path.resolve(process.cwd(), custom);
}

/**
 * بناء المسار النسبي القابل للنقل (Portable Relative Path) للملف المحفوظ في الأرشيف
 * يحافظ على:
 * 1. فصل كل سنة: Archive/2026/
 * 2. فصل كل معاملة في مجلد مستقل: Archive/2026/2026-000125/
 * 3. فصل كل إصدار في مجلد مستقل: Archive/2026/2026-000125/Version-1/
 * 4. تسمية واضحة للملف: 2026-000125-v1.pdf
 * 
 * مثال: Archive/2026/2026-000125/Version-1/2026-000125-v1.pdf
 */
export function buildArchiveRelativePath(
  year: number,
  fileNumber: string,
  versionNumber: number
): { relativePath: string; fileName: string; directoryRelative: string } {
  const safeNum = sanitizeFileNumber(fileNumber);
  const fileName = `${safeNum}-v${versionNumber}.pdf`;
  const directoryRelative = path.posix.join("Archive", String(year), safeNum, `Version-${versionNumber}`);
  const relativePath = path.posix.join(directoryRelative, fileName);
  return { relativePath, fileName, directoryRelative };
}

/**
 * تحويل المسار النسبي المحفوظ في قاعدة البيانات إلى مسار مطلق على الجهاز الحالي
 * اعتماداً على ARCHIVE_ROOT_PATH المهيأ
 */
export function resolveArchiveAbsolutePath(relativePath: string): string {
  // إزالة بادئة 'Archive/' إذا كان root path يشير بالفعل إلى مجلد الأرشيف نفسه
  const normalized = relativePath.replace(/^[/\\]+/, "");
  const baseRoot = getArchiveRootPath();

  if (normalized.startsWith("Archive/") || normalized.startsWith("Archive\\")) {
    const subPath = normalized.slice("Archive/".length);
    return path.resolve(baseRoot, subPath);
  }
  return path.resolve(baseRoot, normalized);
}

export interface SaveArchivePdfResult {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  fileSize: number;
  fileHash: string;
  mimeType: string;
  versionNumber: number;
}

/**
 * حفظ ملف PDF في مجلد الأرشيف المحلي مع حساب الـ Hash ومنع الكتابة فوق الإصدارات السابقة
 * 
 * القواعد الصارمة:
 * - Version 1 هي النسخة الأصلية الرسمية المعتمدة ولا يجوز استبدالها أبداً
 * - ممنوع الكتابة فوق ملف موجود لنفس الإصدار (يُلقي خطأ إذا كان الملف موجوداً بالفعل)
 * - لا يتم تخزين أي محتوى ثنائي (BLOB) في MySQL، بل يُحفظ الملف على القرص فقط
 */
export async function saveArchivePdfVersion(options: {
  year: number;
  fileNumber: string;
  versionNumber: number;
  pdfBuffer: Buffer;
  allowOverwrite?: boolean;
}): Promise<SaveArchivePdfResult> {
  const { year, fileNumber, versionNumber, pdfBuffer, allowOverwrite = false } = options;

  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error("لا يمكن أرشفة ملف PDF فارغ");
  }

  if (versionNumber < 1) {
    throw new Error("رقم إصدار الـ PDF يجب أن يكون 1 أو أكبر");
  }

  // حساب الـ Hash (SHA-256) قبل الحفظ
  const fileHash = computePdfHash(pdfBuffer);
  const fileSize = pdfBuffer.length;

  const { relativePath, fileName } = buildArchiveRelativePath(year, fileNumber, versionNumber);
  const absolutePath = resolveArchiveAbsolutePath(relativePath);
  const dirPath = path.dirname(absolutePath);

  // التأكد من وجود المجلدات الشجرية
  await fs.mkdir(dirPath, { recursive: true });

  // فحص ما إذا كان الملف موجوداً مسبقاً لمنع التعديل أو الكتابة فوقه
  try {
    await fs.access(absolutePath);
    if (!allowOverwrite) {
      throw new Error(
        `ملف الإصدار رقم (${versionNumber}) موجود مسبقاً في الأرشيف ولا يمكن الكتابة فوقه: ${relativePath}`
      );
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  // كتابة الملف فعلياً على القرص المحلي
  await fs.writeFile(absolutePath, pdfBuffer);

  return {
    fileName,
    relativePath,
    absolutePath,
    fileSize,
    fileHash,
    mimeType: "application/pdf",
    versionNumber,
  };
}

/**
 * التحقق من سلامة ملف الـ PDF الموجود على القرص ومطابقته للـ Hash المحفوظ في MySQL
 */
export async function verifyArchivePdfIntegrity(
  relativePath: string,
  expectedHash: string
): Promise<{ isValid: boolean; actualHash?: string; error?: string }> {
  try {
    const absolutePath = resolveArchiveAbsolutePath(relativePath);
    const content = await fs.readFile(absolutePath);
    const actualHash = computePdfHash(content);
    return {
      isValid: actualHash.toLowerCase() === expectedHash.toLowerCase(),
      actualHash,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: err?.message || "تعذر قراءة الملف من القرص",
    };
  }
}

/**
 * قراءة محتوى ملف الـ PDF المؤرشف من القرص باستخدام المسار النسبي
 */
export async function readArchivePdf(relativePath: string): Promise<Buffer> {
  const absolutePath = resolveArchiveAbsolutePath(relativePath);
  return await fs.readFile(absolutePath);
}
