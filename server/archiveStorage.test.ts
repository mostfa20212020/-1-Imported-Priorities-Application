import { describe, expect, it, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  computePdfHash,
  sanitizeFileNumber,
  buildArchiveRelativePath,
  resolveArchiveAbsolutePath,
  saveArchivePdfVersion,
  verifyArchivePdfIntegrity,
  readArchivePdf,
} from "./archiveStorage";

describe("Archive Storage & PDF Versioning", () => {
  const dummyPdf = Buffer.from("%PDF-1.4 sample pdf content for prosecution archive unit test");

  it("computes accurate SHA-256 hash from PDF buffer", () => {
    const hash = computePdfHash(dummyPdf);
    expect(hash).toHaveLength(64); // SHA-256 hex length
    // Deterministic hash
    expect(computePdfHash(dummyPdf)).toBe(hash);
  });

  it("sanitizes file numbers to be OS-safe paths", () => {
    expect(sanitizeFileNumber("2026/101")).toBe("2026-101");
    expect(sanitizeFileNumber("2026\\000125")).toBe("2026-000125");
    expect(sanitizeFileNumber("خاص: 45/2026")).toBe("خاص-45-2026");
  });

  it("builds structured portable relative paths", () => {
    const { relativePath, fileName, directoryRelative } = buildArchiveRelativePath(2026, "2026/000125", 1);
    expect(fileName).toBe("2026-000125-v1.pdf");
    expect(directoryRelative).toBe("Archive/2026/2026-000125/Version-1");
    expect(relativePath).toBe("Archive/2026/2026-000125/Version-1/2026-000125-v1.pdf");
  });

  it("builds independent paths for Version 2 and Version 3 without collision", () => {
    const v1 = buildArchiveRelativePath(2026, "2026-101", 1);
    const v2 = buildArchiveRelativePath(2026, "2026-101", 2);
    const v3 = buildArchiveRelativePath(2026, "2026-101", 3);

    expect(v1.relativePath).not.toBe(v2.relativePath);
    expect(v2.relativePath).not.toBe(v3.relativePath);
    expect(v1.relativePath).toContain("Version-1/2026-101-v1.pdf");
    expect(v2.relativePath).toContain("Version-2/2026-101-v2.pdf");
    expect(v3.relativePath).toContain("Version-3/2026-101-v3.pdf");
  });

  it("saves PDF version on disk with hash and prevents overwriting previous versions", async () => {
    const testFileNum = `test-${Date.now()}`;
    const resultV1 = await saveArchivePdfVersion({
      year: 2026,
      fileNumber: testFileNum,
      versionNumber: 1,
      pdfBuffer: dummyPdf,
    });

    expect(resultV1.versionNumber).toBe(1);
    expect(resultV1.fileSize).toBe(dummyPdf.length);
    expect(resultV1.fileHash).toBe(computePdfHash(dummyPdf));
    expect(resultV1.mimeType).toBe("application/pdf");

    // Verify file actually written to disk
    const readBack = await readArchivePdf(resultV1.relativePath);
    expect(readBack.toString()).toBe(dummyPdf.toString());

    // Verify integrity check succeeds
    const integrityValid = await verifyArchivePdfIntegrity(resultV1.relativePath, resultV1.fileHash);
    expect(integrityValid.isValid).toBe(true);

    // Verify integrity check fails with altered hash
    const integrityInvalid = await verifyArchivePdfIntegrity(resultV1.relativePath, "0000000000000000000000000000000000000000000000000000000000000000");
    expect(integrityInvalid.isValid).toBe(false);

    // Verify saving same version again throws error to protect immutability
    await expect(
      saveArchivePdfVersion({
        year: 2026,
        fileNumber: testFileNum,
        versionNumber: 1,
        pdfBuffer: Buffer.from("%PDF modified"),
        allowOverwrite: false,
      })
    ).rejects.toThrow(/موجود مسبقاً في الأرشيف ولا يمكن الكتابة فوقه/);

    // Verify saving Version 2 works cleanly in its own directory
    const dummyV2 = Buffer.from("%PDF-1.4 modified by admin");
    const resultV2 = await saveArchivePdfVersion({
      year: 2026,
      fileNumber: testFileNum,
      versionNumber: 2,
      pdfBuffer: dummyV2,
    });

    expect(resultV2.versionNumber).toBe(2);
    expect(resultV2.relativePath).toContain("Version-2");

    // Version 1 still intact on disk
    const v1Content = await readArchivePdf(resultV1.relativePath);
    expect(v1Content.toString()).toBe(dummyPdf.toString());
  });
});
