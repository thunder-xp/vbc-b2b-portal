// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { CustomerProposalDto } from "../../types";
import { DEFAULT_PROPOSAL_SETTINGS } from "../proposal.service";
import { createDocumentDefinition, loadProposalImages, renderProposalPdf, resolveProposalImageRequestUrl } from "../proposal-pdf.renderer";

vi.mock("server-only", () => ({}));

describe("proposal PDF renderer", () => {
  it("renders extractable Cyrillic and Romanian text with repeated multipage content", async () => {
    const proposal = fixture(100);
    const rendered = await renderProposalPdf(proposal);
    if (process.env.WRITE_PROPOSAL_PDF_FIXTURE) { mkdirSync(".tmp", { recursive: true }); writeFileSync(".tmp/proposal-100.pdf", rendered.bytes); }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as { getDocument(input: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(page: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }> }> } };
    const pdf = await pdfjs.getDocument({ data: rendered.bytes }).promise;
    const texts: string[] = [];
    for (let page = 1; page <= pdf.numPages; page++) { const content = await (await pdf.getPage(page)).getTextContent(); texts.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" ")); }
    const text = texts.join(" ").replace(/\s+/g, " ");
    expect(pdf.numPages).toBeGreaterThan(1);
    expect(text).toContain("Коммерческое предложение");
    expect(text).toContain("Condiții de livrare");
    expect(text).toContain("ИТОГО");
  }, 30_000);

  it("paginates 1, 20, 100, and 300 line proposals within the server budget", async () => {
    for (const count of [1, 10, 30, 100, 300]) {
      const started = performance.now();
      const rendered = await renderProposalPdf(fixture(count));
      if (process.env.BENCHMARK_PROPOSAL_PDF) console.info({ lineCount: count, durationMs: Number((performance.now() - started).toFixed(1)), pageCount: rendered.pageCount, bytes: rendered.bytes.byteLength });
      expect(rendered.bytes.byteLength).toBeGreaterThan(1_000);
      expect(rendered.pageCount).toBeGreaterThanOrEqual(1);
      expect(performance.now() - started).toBeLessThan(15_000);
    }
  }, 45_000);

  it("keeps the image column before description and generates with missing product images", async () => {
    const proposal = fixture(1);
    const definition = JSON.stringify(createDocumentDefinition(proposal, new Map([["image", "data:image/png;base64,AA=="]])));
    const withImage = { ...proposal, sections: [{ ...proposal.sections[0], lines: [{ ...proposal.sections[0].lines[0], imageUrl: "image" }] }] };
    const imageDefinition = JSON.stringify(createDocumentDefinition(withImage, new Map([["image", "data:image/png;base64,AA=="]])));
    expect(imageDefinition.indexOf('"image":"data:image/png')).toBeLessThan(imageDefinition.indexOf("Камера видеонаблюдения 1"));
    expect(definition).toContain('"dontBreakRows":true');
    await expect(renderProposalPdf(proposal)).resolves.toEqual(expect.objectContaining({ pageCount: expect.any(Number) }));
  });

  it("keeps service rows image-free in a mixed proposal", () => {
    const base = fixture(1);
    const product = { ...base.sections[0].lines[0], imageUrl: "product-image" };
    const service = { ...product, position: 2, lineType: "service" as const, sku: null, imageUrl: null, description: "Монтаж" };
    const proposal = { ...base, sections: [{ ...base.sections[0], lines: [product, service] }] };
    const definition = JSON.stringify(createDocumentDefinition(proposal, new Map([["product-image", "data:image/png;base64,AA=="]])));

    expect(definition.match(/data:image\/png/g)).toHaveLength(1);
    expect(definition).toContain("Монтаж");
  });

  it("deduplicates repeated approved image downloads and rejects unapproved origins", async () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://www.nsd.md");
    const image = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_thumb.jpg?alt=media";
    const response = new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg", "content-length": "4" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const base = fixture(30);
    const proposal = { ...base, sections: [{ ...base.sections[0], lines: base.sections[0].lines.map((line) => ({ ...line, imageUrl: image })) }] };

    const images = await loadProposalImages(proposal);

    expect(images.has(image)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://www.nsd.md/_next/image?");
    expect(resolveProposalImageRequestUrl("https://attacker.example/image.jpg")).toBeNull();
    fetchMock.mockClear();
    const rejected = { ...base, sections: [{ ...base.sections[0], lines: [{ ...base.sections[0].lines[0], imageUrl: "https://attacker.example/image.jpg" }] }] };
    await expect(loadProposalImages(rejected)).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  });
});

function fixture(lineCount: number): CustomerProposalDto { return { schemaVersion: "2026-07-16-v1", estimateNumber: "KP-2026-000001", generatedForDate: "2026-07-16", customerName: "Клиент SRL", projectName: "Объект", currencyCode: "USD", settings: { ...DEFAULT_PROPOSAL_SETTINGS, deliveryTerms: "Condiții de livrare" }, branding: { companyName: "Партнёр SRL", legalName: null, contactName: null, phone: null, email: null, website: null, fiscalInformation: null, address: null, logoUrl: null }, sections: [{ name: "Оборудование", subtotal: lineCount * 100, lines: Array.from({ length: lineCount }, (_, index) => ({ position: index + 1, lineType: "product", description: `Камера видеонаблюдения ${index + 1}`, sku: `SKU-${index + 1}`, imageUrl: null, quantity: 1, unitLabel: "шт.", unitPrice: 100, lineDiscountPercent: 0, lineTotal: 100 })) }], charges: [], totals: { subtotal: lineCount * 100, discounts: 0, charges: 0, totalExcludingVat: lineCount * 100, vat: 0, total: lineCount * 100 } }; }
