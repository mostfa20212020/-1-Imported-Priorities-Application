import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import { storagePut } from "./storage";
import { getIncomingFile, updateIncomingFile } from "./db";
import type { IncomingFile } from "../drizzle/schema";

export async function generateProsecutionPdf(
  file: IncomingFile,
  type: "original" | "signed" = "original"
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let arabicFont;
  try {
    const fontPath = path.join(process.cwd(), "server/assets/NotoSansArabic.ttf");
    const fontBytes = await fs.readFile(fontPath);
    arabicFont = await doc.embedFont(fontBytes, { subset: true });
  } catch (err) {
    console.warn("[PDF] Could not load NotoSansArabic, fallback to standard fonts", err);
  }

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const fontToUse = arabicFont || bold;

  const page = doc.addPage([595, 842]); // A4
  const width = page.getWidth();
  const height = page.getHeight();
  const margin = 36;
  const contentWidth = width - margin * 2;

  // Header Background Card
  page.drawRectangle({
    x: margin,
    y: height - 120,
    width: contentWidth,
    height: 90,
    color: rgb(0.95, 0.97, 0.98),
    borderColor: rgb(0.09, 0.23, 0.31),
    borderWidth: 1.5,
  });

  // Green top accent line
  page.drawRectangle({
    x: margin,
    y: height - 34,
    width: contentWidth,
    height: 4,
    color: rgb(0.20, 0.58, 0.45),
  });

  page.drawText("الجمهورية اليمنية - النيابة العامة", {
    x: margin + 20,
    y: height - 60,
    size: 15,
    font: fontToUse,
    color: rgb(0.09, 0.23, 0.31),
  });

  page.drawText("مكتب رئيس النيابة العامة | منظومة إدارة الأوليات والمكاتبات", {
    x: margin + 20,
    y: height - 80,
    size: 10,
    font: fontToUse,
    color: rgb(0.25, 0.38, 0.40),
  });

  page.drawText(`PUBLIC PROSECUTION - INCOMING FILE #${file.fileNumber}`, {
    x: margin + 20,
    y: height - 100,
    size: 8.5,
    font: bold,
    color: rgb(0.40, 0.48, 0.52),
  });

  // Reference Meta Box
  const metaY = height - 190;
  page.drawRectangle({
    x: margin,
    y: metaY,
    width: contentWidth,
    height: 60,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.90),
    borderWidth: 1,
  });

  const arrivalStr = file.arrivalDate
    ? new Date(file.arrivalDate).toISOString().slice(0, 10)
    : "غير محدد";

  page.drawText(`رقم الوارد: ${file.fileNumber}`, {
    x: margin + 18,
    y: metaY + 36,
    size: 10,
    font: fontToUse,
    color: rgb(0.10, 0.25, 0.31),
  });

  page.drawText(`السنة القضائية: ${file.year}`, {
    x: margin + 170,
    y: metaY + 36,
    size: 10,
    font: fontToUse,
    color: rgb(0.10, 0.25, 0.31),
  });

  page.drawText(`تاريخ الورود: ${arrivalStr}`, {
    x: margin + 330,
    y: metaY + 36,
    size: 10,
    font: fontToUse,
    color: rgb(0.10, 0.25, 0.31),
  });

  page.drawText(`نوع الوارد: ${file.fileType}`, {
    x: margin + 18,
    y: metaY + 14,
    size: 10,
    font: fontToUse,
    color: rgb(0.10, 0.25, 0.31),
  });

  const impLabel =
    file.importance === "urgent"
      ? "عاجل جداً"
      : file.importance === "important"
      ? "هام"
      : "عادي";

  page.drawText(`درجة الأهمية: ${impLabel}`, {
    x: margin + 170,
    y: metaY + 14,
    size: 10,
    font: fontToUse,
    color: file.importance === "urgent" ? rgb(0.75, 0.15, 0.15) : rgb(0.10, 0.25, 0.31),
  });

  page.drawText(`المسؤول الحالي: ${file.currentResponsible || "رئيس النيابة العامة"}`, {
    x: margin + 330,
    y: metaY + 14,
    size: 9.5,
    font: fontToUse,
    color: rgb(0.10, 0.25, 0.31),
  });

  // Subject Box
  const subjectY = metaY - 95;
  page.drawRectangle({
    x: margin,
    y: subjectY,
    width: contentWidth,
    height: 85,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.85, 0.88, 0.90),
    borderWidth: 1,
  });

  page.drawText(`جهة الورود: ${file.sourceEntity}`, {
    x: margin + 18,
    y: subjectY + 60,
    size: 10.5,
    font: fontToUse,
    color: rgb(0.09, 0.23, 0.31),
  });

  page.drawText("موضوع المعاملة:", {
    x: margin + 18,
    y: subjectY + 40,
    size: 10.5,
    font: fontToUse,
    color: rgb(0.20, 0.58, 0.45),
  });

  // Shorten/wrap subject safely
  const subText = file.subject.length > 80 ? file.subject.slice(0, 77) + "..." : file.subject;
  page.drawText(subText, {
    x: margin + 18,
    y: subjectY + 20,
    size: 9.5,
    font: fontToUse,
    color: rgb(0.15, 0.20, 0.25),
  });

  // Instructions & Workflow Box
  const instrY = subjectY - 120;
  page.drawRectangle({
    x: margin,
    y: instrY,
    width: contentWidth,
    height: 110,
    color: rgb(0.96, 0.98, 0.99),
    borderColor: rgb(0.75, 0.82, 0.86),
    borderWidth: 1,
  });

  page.drawText("توجيهات وتعليمات رئيس النيابة العامة:", {
    x: margin + 18,
    y: instrY + 86,
    size: 11,
    font: fontToUse,
    color: rgb(0.09, 0.23, 0.31),
  });

  const instrContent =
    file.directorInstruction ||
    file.signedInstruction ||
    "المعاملة قيد العرض والمتابعة لدى فضيلة رئيس النيابة العامة لاتخاذ الإجراء القانوني اللازم.";

  const instrSlice = instrContent.length > 160 ? instrContent.slice(0, 155) + "..." : instrContent;
  page.drawText(instrSlice, {
    x: margin + 18,
    y: instrY + 62,
    size: 9.5,
    font: fontToUse,
    color: rgb(0.20, 0.25, 0.30),
  });

  if (file.assignedDepartment) {
    page.drawText(`الإدارة المحال إليها: ${file.assignedDepartment}`, {
      x: margin + 18,
      y: instrY + 36,
      size: 9.5,
      font: fontToUse,
      color: rgb(0.15, 0.35, 0.40),
    });
  }

  if (file.notes) {
    page.drawText(`ملاحظات: ${file.notes.slice(0, 80)}`, {
      x: margin + 18,
      y: instrY + 16,
      size: 8.5,
      font: fontToUse,
      color: rgb(0.40, 0.45, 0.50),
    });
  }

  // If signed or type is signed, draw the official stamp
  if (type === "signed" || file.isSigned) {
    const stampY = instrY - 110;
    page.drawRectangle({
      x: margin,
      y: stampY,
      width: contentWidth,
      height: 95,
      color: rgb(0.93, 0.97, 0.95),
      borderColor: rgb(0.20, 0.58, 0.45),
      borderWidth: 1.5,
    });

    page.drawRectangle({
      x: margin,
      y: stampY + 91,
      width: contentWidth,
      height: 4,
      color: rgb(0.20, 0.58, 0.45),
    });

    page.drawText("الختم والتوقيع الإلكتروني المعتمد | OFFICIAL ELECTRONIC SIGNATURE", {
      x: margin + 18,
      y: stampY + 70,
      size: 9,
      font: fontToUse,
      color: rgb(0.09, 0.23, 0.31),
    });

    page.drawText(`الموقّع: ${file.signatureName || "فضيلة القاضي / رئيس النيابة العامة"}`, {
      x: margin + 18,
      y: stampY + 50,
      size: 10,
      font: fontToUse,
      color: rgb(0.10, 0.35, 0.25),
    });

    page.drawText(`الصفة: ${file.signatureTitle || "رئيس النيابة العامة"}`, {
      x: margin + 18,
      y: stampY + 32,
      size: 9.5,
      font: fontToUse,
      color: rgb(0.25, 0.38, 0.40),
    });

    const signDateStr = file.signedAt
      ? new Date(file.signedAt).toISOString().slice(0, 19).replace("T", " ")
      : new Date().toISOString().slice(0, 19).replace("T", " ");

    page.drawText(`تاريخ الاعتماد: ${signDateStr} UTC`, {
      x: margin + 18,
      y: stampY + 14,
      size: 8.5,
      font: fontToUse,
      color: rgb(0.35, 0.45, 0.45),
    });

    page.drawText("CERTIFIED SECURE DIGITAL ARCHIVE", {
      x: width - margin - 220,
      y: stampY + 14,
      size: 8,
      font: bold,
      color: rgb(0.20, 0.58, 0.45),
    });
  }

  // Footer
  page.drawText("وثيقة إلكترونية رسمية صادرة ومؤرشفة ضمن منظومة إدارة الأوليات - النيابة العامة", {
    x: margin + 20,
    y: 30,
    size: 8,
    font: fontToUse,
    color: rgb(0.50, 0.55, 0.60),
  });

  page.drawText(`Generated on: ${new Date().toISOString().slice(0, 10)}`, {
    x: width - margin - 140,
    y: 30,
    size: 7.5,
    font: regular,
    color: rgb(0.50, 0.55, 0.60),
  });

  return Buffer.from(await doc.save());
}

/**
 * Ensures that all default demo files in the database have a working PDF file in storage.
 */
export async function ensureDefaultPdfs(files: IncomingFile[]): Promise<void> {
  for (const file of files) {
    try {
      // 1. Ensure original PDF
      if (!file.originalFileUrl || !file.originalFileKey) {
        const pdfBytes = await generateProsecutionPdf(file, "original");
        const stored = await storagePut(
          `incoming/original/${file.year}/${file.fileNumber}.pdf`,
          pdfBytes,
          "application/pdf"
        );
        file.originalFileKey = stored.key;
        file.originalFileUrl = stored.url;
        await updateIncomingFile(file.id, {
          originalFileKey: stored.key,
          originalFileUrl: stored.url,
        });
      }

      // 2. Ensure signed PDF if marked signed
      if (file.isSigned && (!file.signedFileUrl || !file.signedFileKey)) {
        const signedBytes = await generateProsecutionPdf(file, "signed");
        const storedSigned = await storagePut(
          `incoming/signed/${file.year}/${file.fileNumber}.pdf`,
          signedBytes,
          "application/pdf"
        );
        file.signedFileKey = storedSigned.key;
        file.signedFileUrl = storedSigned.url;
        await updateIncomingFile(file.id, {
          signedFileKey: storedSigned.key,
          signedFileUrl: storedSigned.url,
        });
      }
    } catch (err) {
      console.warn(`[PDF] Could not generate default PDF for file #${file.fileNumber}:`, err);
    }
  }
}
