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
});
