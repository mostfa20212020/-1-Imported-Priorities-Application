import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addSignatureStamp } from "./routers";

describe("Arabic PDF signature stamp", () => {
  it("embeds an Arabic-capable font and saves a stamped PDF", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const original = Buffer.from(await source.save());

    const signed = await addSignatureStamp(
      original,
      "١٢٣ / ٢٠٢٦",
      "رئيس النيابة العامة",
      "رئيس النيابة العامة",
      new Date("2026-09-14T07:30:37.000Z"),
    );

    expect(signed.length).toBeGreaterThan(original.length);
    const parsed = await PDFDocument.load(signed);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("embeds a manual signature PNG and positions it directly on the PDF", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const original = Buffer.from(await source.save());

    // 1x1 transparent PNG sample
    const sampleSignaturePng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const signed = await addSignatureStamp(
      original,
      "١٢٣ / ٢٠٢٦",
      "فضيلة النائب العام",
      "النائب العام للجمهورية",
      new Date(),
      {
        pngBase64: sampleSignaturePng,
        positionPercent: { x: 15, y: 70, width: 25, height: 8 },
        includeOfficialBadge: true,
      }
    );

    expect(signed.length).toBeGreaterThan(original.length);
    const parsed = await PDFDocument.load(signed);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("handles empty or whitespace signer credentials gracefully without throwing", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const original = Buffer.from(await source.save());

    const signed = await addSignatureStamp(
      original,
      "٩٩٩ / ٢٠٢٦",
      "",
      "",
      new Date(),
      {
        includeOfficialBadge: true,
      }
    );

    expect(signed.length).toBeGreaterThan(original.length);
    const parsed = await PDFDocument.load(signed);
    expect(parsed.getPageCount()).toBe(1);
  });
});
