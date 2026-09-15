import "server-only";

import type { TDocumentDefinitions } from "pdfmake/interfaces";
import pdfMake from "pdfmake/build/pdfmake";
import robotoFonts from "pdfmake/build/vfs_fonts";

import { normalizeProductImageUrl } from "../../catalog/components/product-image-source";
import { proposalLineNumber, proposalLinePresentation, proposalVatLabels, sectionSubtotalLabel } from "./proposal-presentation";
import type { CustomerProposalDto, CustomerProposalLine } from "../types";

type PdfMakeRuntime = { addVirtualFileSystem(vfs: unknown): void; setUrlAccessPolicy(callback: (url: string) => boolean): void; createPdf(definition: unknown): { getBuffer(): Promise<Buffer> } };
export type ProposalPdfPerformance = {
  imageReferenceCount: number;
  uniqueImageCount: number;
  imageRequestCount: number;
  loadedImageCount: number;
  failedImageCount: number;
  timedOutImageCount: number;
  sourceImageBytes: number;
  embeddedImageBytes: number;
  stageMs: {
    imageIdentityResolution: number;
    imageFetchWall: number;
    imageFetchAggregate: number;
    imageTransformAggregate: number;
    imagePreparation: number;
    documentDefinition: number;
    pdfRendererAndImageEmbedding: number;
  };
};
type PreparedImage = { dataUrl: string | null; sourceBytes: number; fetchMs: number; transformMs: number; timedOut: boolean };
const runtime = pdfMake as unknown as PdfMakeRuntime;
runtime.addVirtualFileSystem(robotoFonts);
runtime.setUrlAccessPolicy(() => false);

export async function renderProposalPdf(proposal: CustomerProposalDto): Promise<{ bytes: Uint8Array; pageCount: number; performance: ProposalPdfPerformance }> {
  const imagePreparationStartedAt = performance.now();
  const preparedImages = proposal.settings.showProductImages
    ? await prepareProposalImages(proposal)
    : emptyPreparedImages();
  const imagePreparationFinishedAt = performance.now();
  const images = preparedImages.images;
  const definitionStartedAt = performance.now();
  const definition = createDocumentDefinition(proposal, images);
  const definitionFinishedAt = performance.now();
  const buffer = await runtime.createPdf(definition).getBuffer();
  const rendererFinishedAt = performance.now();
  const bytes = new Uint8Array(buffer);
  return {
    bytes,
    pageCount: countPdfPages(bytes),
    performance: {
      ...preparedImages.performance,
      stageMs: {
        ...preparedImages.performance.stageMs,
        imagePreparation: roundedMs(imagePreparationFinishedAt - imagePreparationStartedAt),
        documentDefinition: roundedMs(definitionFinishedAt - definitionStartedAt),
        pdfRendererAndImageEmbedding: roundedMs(rendererFinishedAt - definitionFinishedAt),
      },
    },
  };
}

export function createDocumentDefinition(proposal: CustomerProposalDto, images = new Map<string, string>()): TDocumentDefinitions {
  const content: Array<Record<string, unknown>> = [
    { columns: [brandingBlock(proposal, images), documentHeadingBlock(proposal)], margin: [0, 0, 0, 9] },
  ];

  for (const section of proposal.sections) {
    content.push(productTable(proposal, section.name, section.subtotal, section.lines, images));
  }

  if (proposal.charges.length) {
    content.push({ text: "Дополнительные работы и услуги", style: "section", margin: [0, 16, 0, 7] });
    content.push({ table: { widths: ["*", 110], body: proposal.charges.map((charge) => [{ text: charge.description }, { text: money(charge.amount, proposal.currencyCode), alignment: "right" }]) }, layout: "lightHorizontalLines" });
  }
  content.push(totalsBlock(proposal));

  return {
    pageSize: "A4", pageMargins: [32, 32, 32, 40], content,
    defaultStyle: { font: "Roboto", fontSize: 8.25, color: "#27272a" },
    styles: { title: { fontSize: 18, bold: true, color: "#14532d", alignment: "right" }, documentNumber: { fontSize: 10, bold: true, alignment: "right", margin: [0, 3, 0, 0] }, section: { fontSize: 10, bold: true, color: "#14532d" } },
    footer: (currentPage: number, pageCount: number) => ({ columns: [{ text: proposal.settings.footerNote || proposal.branding.companyName, color: "#71717a", fontSize: 7 }, { text: `${currentPage} / ${pageCount}`, alignment: "right", color: "#71717a", fontSize: 7 }], margin: [38, 18, 38, 0] }),
    info: { title: `${proposal.settings.title} ${proposal.estimateNumber}`, author: proposal.branding.companyName, subject: "Коммерческое предложение" },
  } as unknown as TDocumentDefinitions;
}

function brandingBlock(proposal: CustomerProposalDto, images: Map<string, string>): Record<string, unknown> {
  const lines = [proposal.branding.legalName || proposal.branding.companyName, proposal.branding.contactName ? `Ответственный: ${proposal.branding.contactName}` : null, proposal.branding.phone, proposal.branding.email, proposal.branding.address, proposal.branding.fiscalInformation, proposal.branding.website].filter(Boolean) as string[];
  const stack: Array<Record<string, unknown>> = [{ text: proposal.branding.companyName, fontSize: 14, bold: true, color: "#166534" }, ...lines.map((text) => ({ text, fontSize: 7, color: "#52525b", margin: [0, 1, 0, 0] }))];
  if (proposal.settings.showPartnerLogo && proposal.branding.logoUrl && images.has(proposal.branding.logoUrl)) stack.unshift({ image: images.get(proposal.branding.logoUrl), width: 64, height: 32, fit: [64, 32], margin: [0, 0, 0, 3] });
  return { stack };
}

function productTable(proposal: CustomerProposalDto, sectionName: string, sectionSubtotal: number, lines: ReadonlyArray<CustomerProposalLine>, images: Map<string, string>): Record<string, unknown> {
  const showImage = proposal.settings.showProductImages && lines.some((line) => isProductProposalLine(line) && Boolean(line.imageUrl && images.has(line.imageUrl)));
  const descriptiveColumnCount = showImage ? 3 : 2;
  const headers: Array<Record<string, unknown>> = [
    { text: sectionName, style: "section", colSpan: descriptiveColumnCount },
    ...Array.from({ length: descriptiveColumnCount - 1 }, () => ({ text: "" })),
    { text: "Кол-во", bold: true, alignment: "right" },
  ];
  if (proposal.settings.showUnitPrice) headers.push({ text: "Цена за ед.", bold: true, alignment: "right" });
  if (proposal.settings.showLineDiscount) headers.push({ text: "Скидка", bold: true, alignment: "right" });
  headers.push({ text: "Сумма", bold: true, alignment: "right" });
  const rows = lines.map((line, lineIndex) => {
    const presentation = proposalLinePresentation(line, proposal.settings);
    const identity: Array<Record<string, unknown>> = [];
    if (presentation.sku) identity.push({ text: presentation.sku, fontSize: 6.4, bold: false, color: "#71717a" });
    if (presentation.sku && presentation.productName) identity.push({ text: "  " });
    if (presentation.productName) identity.push({ text: presentation.productName, fontSize: 7.4, bold: false, color: "#18181b" });
    const descriptionStack: Array<Record<string, unknown>> = [];
    if (identity.length) descriptionStack.push({ text: identity, lineHeight: 1.02 });
    if (presentation.description) descriptionStack.push({ text: presentation.description, fontSize: 6.2, bold: false, color: "#52525b", lineHeight: 1.02, alignment: "justify", margin: [0, identity.length ? 1 : 0, 0, 0] });
    const description: Record<string, unknown> = {
      stack: descriptionStack.length ? descriptionStack : [{ text: "" }],
    };
    const row: Array<Record<string, unknown>> = [{ text: String(proposalLineNumber(proposal.schemaVersion, lineIndex, line.position)), color: "#71717a" }];
    if (showImage) row.push(isProductProposalLine(line) ? line.imageUrl && images.has(line.imageUrl) ? { image: images.get(line.imageUrl)!, width: 26, height: 26, fit: [26, 26] } : { text: "—", color: "#a1a1aa", alignment: "center", margin: [0, 7, 0, 0] } : { text: "" });
    row.push(description, { text: formatNumber(line.quantity), alignment: "right", noWrap: true });
    if (proposal.settings.showUnitPrice) row.push({ text: money(line.unitPrice, proposal.currencyCode), alignment: "right", noWrap: true });
    if (proposal.settings.showLineDiscount) row.push({ text: line.lineDiscountPercent ? `${formatNumber(line.lineDiscountPercent)}%` : "—", alignment: "right" });
    row.push({ text: money(line.lineTotal, proposal.currencyCode), alignment: "right", bold: true, noWrap: true });
    return row;
  });
  if (proposal.settings.showSectionSubtotals && lines.length > 0) {
    rows.push([{ text: sectionSubtotalLabel(sectionName), colSpan: headers.length - 1, alignment: "right", bold: true, fillColor: "#f4f4f5" }, ...Array.from({ length: headers.length - 2 }, () => ({ text: "", fillColor: "#f4f4f5" })), { text: money(sectionSubtotal, proposal.currencyCode), alignment: "right", bold: true, fillColor: "#f4f4f5", noWrap: true }]);
  }
  const widths: Array<number | "*"> = [14, ...(showImage ? [28] : []), "*", 30, ...(proposal.settings.showUnitPrice ? [58] : []), ...(proposal.settings.showLineDiscount ? [34] : []), 62];
  return { margin: [0, 0, 0, 7], table: { headerRows: 1, widths, dontBreakRows: true, body: [headers, ...rows] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? "#ecfdf5" : rowIndex % 2 === 0 ? "#fafafa" : null, hLineColor: () => "#d4d4d8", vLineColor: () => "#e4e4e7", paddingTop: (rowIndex: number) => rowIndex === 0 ? 3 : 2.5, paddingBottom: (rowIndex: number) => rowIndex === 0 ? 3 : 2.5, paddingLeft: () => 3, paddingRight: () => 3 } };
}

function totalsBlock(proposal: CustomerProposalDto): Record<string, unknown> {
  const labels = proposalVatLabels(proposal);
  const rows: Array<Array<Record<string, unknown>>> = [];
  if (proposal.totals.discounts) rows.push([{ text: "Скидки" }, { text: `− ${money(proposal.totals.discounts, proposal.currencyCode)}`, alignment: "right" }]);
  if (proposal.totals.charges) rows.push([{ text: "Дополнительные услуги" }, { text: money(proposal.totals.charges, proposal.currencyCode), alignment: "right" }]);
  rows.push([{ text: labels.excludingVat }, { text: money(proposal.totals.totalExcludingVat, proposal.currencyCode), alignment: "right" }]);
  if (proposal.settings.showVatBreakdown && labels.vat) rows.push([{ text: labels.vat }, { text: money(proposal.totals.vat, proposal.currencyCode), alignment: "right" }]);
  rows.push([{ text: "К оплате", bold: true, fontSize: 13, color: "#14532d", fillColor: "#ecfdf5", margin: [4, 3, 4, 3] }, { text: money(proposal.totals.total, proposal.currencyCode), bold: true, fontSize: 13, color: "#14532d", alignment: "right", fillColor: "#ecfdf5", margin: [4, 3, 4, 3] }]);
  return { unbreakable: true, columns: [{ width: "*", text: "" }, { width: 240, table: { widths: ["*", 96], body: rows }, layout: "lightHorizontalLines", margin: [0, 12, 0, 0] }] };
}

function documentMetadata(proposal: CustomerProposalDto): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [
    { text: proposal.estimateNumber, style: "documentNumber" },
    { text: `Дата: ${formatDate(proposal.generatedForDate)}`, alignment: "right", color: "#71717a" },
  ];
  if (proposal.validUntilDate) rows.push({ text: `Действительно до: ${formatDate(proposal.validUntilDate)}`, alignment: "right", color: "#71717a" });
  return rows;
}

function documentHeadingBlock(proposal: CustomerProposalDto): Record<string, unknown> {
  const stack: Array<Record<string, unknown>> = [];
  if (proposal.settings.showHeadingGreeting !== false) {
    stack.push({ text: proposal.settings.title, style: "title" });
    if (proposal.settings.introduction) stack.push({ text: proposal.settings.introduction, fontSize: 6.5, bold: false, color: "#52525b", lineHeight: 1.04, margin: [0, 2, 0, 0] });
  }
  stack.push(...documentMetadata(proposal));
  return { stack, alignment: "right" };
}

export async function loadProposalImages(proposal: CustomerProposalDto, options?: { timeoutMs?: number }): Promise<Map<string, string>> {
  return (await prepareProposalImages(proposal, options)).images;
}

async function prepareProposalImages(proposal: CustomerProposalDto, options?: { timeoutMs?: number }) {
  const identityStartedAt = performance.now();
  const references = [...(proposal.settings.showPartnerLogo && proposal.branding.logoUrl ? [proposal.branding.logoUrl] : []), ...proposal.sections.flatMap((section) => section.lines.flatMap((line) => isProductProposalLine(line) && line.imageUrl ? [line.imageUrl] : []))];
  const urls = [...new Set(references)].slice(0, 60);
  const requests = urls.flatMap((rawUrl) => {
    const requestUrl = resolveProposalImageRequestUrl(rawUrl);
    return requestUrl ? [{ rawUrl, requestUrl }] : [];
  });
  const identityFinishedAt = performance.now();
  const fetchStartedAt = performance.now();
  const timeoutMs = Math.max(1, Math.min(options?.timeoutMs ?? 2500, 2500));
  const entries = await mapConcurrent(requests, 4, async ({ rawUrl, requestUrl }) => [rawUrl, await fetchTrustedImage(requestUrl, timeoutMs)] as const);
  const fetchFinishedAt = performance.now();
  const images = new Map(entries.flatMap(([rawUrl, result]) => result.dataUrl ? [[rawUrl, result.dataUrl] as const] : []));
  const results = entries.map(([, result]) => result);
  return {
    images,
    performance: {
      imageReferenceCount: references.length,
      uniqueImageCount: urls.length,
      imageRequestCount: requests.length,
      loadedImageCount: images.size,
      failedImageCount: requests.length - images.size,
      timedOutImageCount: results.filter((result) => result.timedOut).length,
      sourceImageBytes: results.reduce((sum, result) => sum + result.sourceBytes, 0),
      embeddedImageBytes: [...images.values()].reduce((sum, dataUrl) => sum + Buffer.byteLength(dataUrl), 0),
      stageMs: {
        imageIdentityResolution: roundedMs(identityFinishedAt - identityStartedAt),
        imageFetchWall: roundedMs(fetchFinishedAt - fetchStartedAt),
        imageFetchAggregate: roundedMs(results.reduce((sum, result) => sum + result.fetchMs, 0)),
        imageTransformAggregate: roundedMs(results.reduce((sum, result) => sum + result.transformMs, 0)),
        imagePreparation: 0,
        documentDefinition: 0,
        pdfRendererAndImageEmbedding: 0,
      },
    } satisfies ProposalPdfPerformance,
  };
}

async function fetchTrustedImage(url: URL, timeoutMs: number): Promise<PreparedImage> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchStartedAt = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error", headers: { Accept: "image/png,image/jpeg,image/webp" } });
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(type) || length > 1_000_000) return failedPreparedImage(performance.now() - fetchStartedAt);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fetchedAt = performance.now();
    if (bytes.byteLength > 1_000_000) return failedPreparedImage(fetchedAt - fetchStartedAt, bytes.byteLength);
    if (type === "image/webp") {
      const transformStartedAt = performance.now();
      const { default: sharp } = await import("sharp");
      const png = await sharp(bytes).png().toBuffer();
      return { dataUrl: png.byteLength <= 1_000_000 ? `data:image/png;base64,${png.toString("base64")}` : null, sourceBytes: bytes.byteLength, fetchMs: fetchedAt - fetchStartedAt, transformMs: performance.now() - transformStartedAt, timedOut: false };
    }
    return { dataUrl: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`, sourceBytes: bytes.byteLength, fetchMs: fetchedAt - fetchStartedAt, transformMs: 0, timedOut: false };
  } catch { return { ...failedPreparedImage(performance.now() - fetchStartedAt), timedOut: controller.signal.aborted }; } finally { clearTimeout(timer); }
}

function failedPreparedImage(fetchMs: number, sourceBytes = 0): PreparedImage { return { dataUrl: null, sourceBytes, fetchMs, transformMs: 0, timedOut: false }; }
function emptyPreparedImages() {
  return { images: new Map<string, string>(), performance: { imageReferenceCount: 0, uniqueImageCount: 0, imageRequestCount: 0, loadedImageCount: 0, failedImageCount: 0, timedOutImageCount: 0, sourceImageBytes: 0, embeddedImageBytes: 0, stageMs: { imageIdentityResolution: 0, imageFetchWall: 0, imageFetchAggregate: 0, imageTransformAggregate: 0, imagePreparation: 0, documentDefinition: 0, pdfRendererAndImageEmbedding: 0 } } satisfies ProposalPdfPerformance };
}
function roundedMs(value: number): number { return Math.round(value * 10) / 10; }

export function resolveProposalImageRequestUrl(rawUrl: string): URL | null {
  const productImage = normalizeProductImageUrl(rawUrl);
  if (productImage) {
    const appUrl = trustedPortalUrl(process.env.PUBLIC_APP_URL ?? "");
    if (!appUrl) return null;
    const optimized = new URL("/_next/image", appUrl);
    optimized.searchParams.set("url", productImage);
    optimized.searchParams.set("w", "64");
    optimized.searchParams.set("q", "70");
    return optimized;
  }
  return trustedPortalUrl(rawUrl);
}

function trustedPortalUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    const trusted = new Set(["www.nsd.md", "nsd.md"]);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) trusted.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
    return url.protocol === "https:" && !url.username && !url.password && trusted.has(url.hostname) ? url : null;
  } catch { return null; }
}

function isProductProposalLine(line: CustomerProposalLine): boolean { return line.lineType === "product" || (!line.lineType && Boolean(line.sku || line.imageUrl)); }
async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; output[index] = await mapper(items[index]); } }));
  return output;
}

export function countPdfPages(bytes: Uint8Array): number { const matches = Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g); return Math.max(1, matches?.length ?? 1); }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 2 }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
