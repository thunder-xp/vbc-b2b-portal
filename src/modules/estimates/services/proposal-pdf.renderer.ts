import "server-only";

import type { TDocumentDefinitions } from "pdfmake/interfaces";
import pdfMake from "pdfmake/build/pdfmake";
import robotoFonts from "pdfmake/build/vfs_fonts";

import type { CustomerProposalDto, CustomerProposalLine } from "../types";

type PdfMakeRuntime = { addVirtualFileSystem(vfs: unknown): void; setUrlAccessPolicy(callback: (url: string) => boolean): void; createPdf(definition: unknown): { getBuffer(): Promise<Buffer> } };
const runtime = pdfMake as unknown as PdfMakeRuntime;
runtime.addVirtualFileSystem(robotoFonts);
runtime.setUrlAccessPolicy(() => false);

export async function renderProposalPdf(proposal: CustomerProposalDto): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const images = proposal.settings.showProductImages ? await loadTrustedImages(proposal) : new Map<string, string>();
  const definition = createDocumentDefinition(proposal, images);
  const buffer = await runtime.createPdf(definition).getBuffer();
  const bytes = new Uint8Array(buffer);
  return { bytes, pageCount: countPdfPages(bytes) };
}

export function createDocumentDefinition(proposal: CustomerProposalDto, images = new Map<string, string>()): TDocumentDefinitions {
  const content: Array<Record<string, unknown>> = [
    { columns: [brandingBlock(proposal, images), { text: proposal.settings.title, style: "title", alignment: "right" }], margin: [0, 0, 0, 22] },
    { columns: [{ stack: [{ text: "ПОЛУЧАТЕЛЬ", style: "eyebrow" }, { text: proposal.customerName || "Не указан", style: "heading" }, proposal.projectName ? { text: proposal.projectName, color: "#52525b", margin: [0, 3, 0, 0] } : { text: "" }] }, { stack: [{ text: proposal.estimateNumber, style: "documentNumber" }, { text: formatDate(proposal.generatedForDate), alignment: "right", color: "#71717a" }] }], margin: [0, 0, 0, 18] },
  ];
  if (proposal.settings.introduction) content.push({ text: proposal.settings.introduction, margin: [0, 0, 0, 16], lineHeight: 1.25 });

  for (const section of proposal.sections) {
    content.push({ text: section.name, style: "section", margin: [0, 14, 0, 7] });
    content.push(productTable(proposal, section.lines, images));
    if (proposal.settings.showSectionSubtotals) content.push({ columns: [{ text: "" }, { text: `Итого по разделу: ${money(section.subtotal, proposal.currencyCode)}`, bold: true, alignment: "right", margin: [0, 7, 0, 10] }] });
  }

  if (proposal.charges.length) {
    content.push({ text: "Дополнительные работы и услуги", style: "section", margin: [0, 16, 0, 7] });
    content.push({ table: { widths: ["*", 110], body: proposal.charges.map((charge) => [{ text: charge.description }, { text: money(charge.amount, proposal.currencyCode), alignment: "right" }]) }, layout: "lightHorizontalLines" });
  }
  content.push(totalsBlock(proposal));
  content.push(termsBlock(proposal));

  return {
    pageSize: "A4", pageMargins: [38, 45, 38, 52], content,
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#27272a" },
    styles: { title: { fontSize: 21, bold: true, color: "#14532d" }, eyebrow: { fontSize: 7, bold: true, color: "#15803d", characterSpacing: 1 }, heading: { fontSize: 13, bold: true }, documentNumber: { fontSize: 11, bold: true, alignment: "right" }, section: { fontSize: 12, bold: true, color: "#14532d" } },
    footer: (currentPage: number, pageCount: number) => ({ columns: [{ text: proposal.settings.footerNote || proposal.branding.companyName, color: "#71717a", fontSize: 7 }, { text: `${currentPage} / ${pageCount}`, alignment: "right", color: "#71717a", fontSize: 7 }], margin: [38, 18, 38, 0] }),
    info: { title: `${proposal.settings.title} ${proposal.estimateNumber}`, author: proposal.branding.companyName, subject: "Коммерческое предложение" },
  } as unknown as TDocumentDefinitions;
}

function brandingBlock(proposal: CustomerProposalDto, images: Map<string, string>): Record<string, unknown> {
  const lines = [proposal.branding.legalName || proposal.branding.companyName, proposal.branding.address, proposal.branding.fiscalInformation, proposal.branding.phone, proposal.branding.email, proposal.branding.website].filter(Boolean) as string[];
  const stack: Array<Record<string, unknown>> = [{ text: proposal.branding.companyName, fontSize: 15, bold: true, color: "#166534" }, ...lines.map((text) => ({ text, fontSize: 7, color: "#52525b", margin: [0, 2, 0, 0] }))];
  if (proposal.settings.showPartnerLogo && proposal.branding.logoUrl && images.has(proposal.branding.logoUrl)) stack.unshift({ image: images.get(proposal.branding.logoUrl), width: 70, height: 36, fit: [70, 36], margin: [0, 0, 0, 5] });
  return { stack };
}

function productTable(proposal: CustomerProposalDto, lines: ReadonlyArray<CustomerProposalLine>, images: Map<string, string>): Record<string, unknown> {
  const showImage = proposal.settings.showProductImages && lines.some((line) => line.imageUrl && images.has(line.imageUrl));
  const headers: Array<Record<string, unknown>> = [{ text: "№", bold: true }, ...(showImage ? [{ text: "", bold: true }] : []), { text: "Наименование", bold: true }, { text: "Кол-во", bold: true, alignment: "right" }];
  if (proposal.settings.showUnitPrice) headers.push({ text: "Цена", bold: true, alignment: "right" });
  if (proposal.settings.showLineDiscount) headers.push({ text: "Скидка", bold: true, alignment: "right" });
  headers.push({ text: "Сумма", bold: true, alignment: "right" });
  const rows = lines.map((line) => {
    const description: Record<string, unknown> = { stack: [{ text: line.description, bold: true }, ...(proposal.settings.showSku && line.sku ? [{ text: `SKU ${line.sku}`, fontSize: 7, color: "#71717a" }] : [])] };
    const row: Array<Record<string, unknown>> = [{ text: String(line.position), color: "#71717a" }];
    if (showImage) row.push(line.imageUrl && images.has(line.imageUrl) ? { image: images.get(line.imageUrl)!, width: 34, height: 34, fit: [34, 34] } : { text: "" });
    row.push(description, { text: `${formatNumber(line.quantity)} ${line.unitLabel}`, alignment: "right", noWrap: true });
    if (proposal.settings.showUnitPrice) row.push({ text: money(line.unitPrice, proposal.currencyCode), alignment: "right", noWrap: true });
    if (proposal.settings.showLineDiscount) row.push({ text: line.lineDiscountPercent ? `${formatNumber(line.lineDiscountPercent)}%` : "—", alignment: "right" });
    row.push({ text: money(line.lineTotal, proposal.currencyCode), alignment: "right", bold: true, noWrap: true });
    return row;
  });
  const widths: Array<number | "*"> = [18, ...(showImage ? [40] : []), "*", 48, ...(proposal.settings.showUnitPrice ? [70] : []), ...(proposal.settings.showLineDiscount ? [42] : []), 74];
  return { table: { headerRows: 1, widths, dontBreakRows: true, body: [headers, ...rows] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? "#ecfdf5" : rowIndex % 2 === 0 ? "#fafafa" : null, hLineColor: () => "#d4d4d8", vLineColor: () => "#e4e4e7", paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 5, paddingRight: () => 5 } };
}

function totalsBlock(proposal: CustomerProposalDto): Record<string, unknown> {
  const rows: Array<Array<Record<string, unknown>>> = [[{ text: "Подытог" }, { text: money(proposal.totals.subtotal, proposal.currencyCode), alignment: "right" }]];
  if (proposal.totals.discounts) rows.push([{ text: "Скидки" }, { text: `− ${money(proposal.totals.discounts, proposal.currencyCode)}`, alignment: "right" }]);
  if (proposal.totals.charges) rows.push([{ text: "Дополнительные услуги" }, { text: money(proposal.totals.charges, proposal.currencyCode), alignment: "right" }]);
  if (proposal.settings.showVatBreakdown) rows.push([{ text: "Без НДС" }, { text: money(proposal.totals.totalExcludingVat, proposal.currencyCode), alignment: "right" }], [{ text: "НДС" }, { text: money(proposal.totals.vat, proposal.currencyCode), alignment: "right" }]);
  rows.push([{ text: "ИТОГО", bold: true, fontSize: 12, color: "#14532d" }, { text: money(proposal.totals.total, proposal.currencyCode), bold: true, fontSize: 12, color: "#14532d", alignment: "right" }]);
  return { columns: [{ width: "*", text: "" }, { width: 260, table: { widths: ["*", 100], body: rows }, layout: "lightHorizontalLines", margin: [0, 18, 0, 18] }] };
}

function termsBlock(proposal: CustomerProposalDto): Record<string, unknown> {
  const terms = [["Поставка", proposal.settings.deliveryTerms], ["Оплата", proposal.settings.paymentTerms], ["Гарантия", proposal.settings.warrantyTerms], ["Срок действия", proposal.settings.validityText], ["Монтаж", proposal.settings.installationNotes], ["Исключения", proposal.settings.exclusions], ["Примечание", proposal.settings.customerNote]].filter(([, value]) => value);
  if (!terms.length) return { text: "" };
  return { unbreakable: true, stack: [{ text: "Условия предложения", style: "section", margin: [0, 5, 0, 7] }, { table: { widths: [90, "*"], body: terms.map(([label, value]) => [{ text: label, bold: true, color: "#3f3f46" }, { text: value }]) }, layout: "lightHorizontalLines" }] };
}

async function loadTrustedImages(proposal: CustomerProposalDto): Promise<Map<string, string>> {
  const urls = [...new Set([...(proposal.settings.showPartnerLogo && proposal.branding.logoUrl ? [proposal.branding.logoUrl] : []), ...proposal.sections.flatMap((section) => section.lines.flatMap((line) => line.imageUrl ? [line.imageUrl] : []))])].slice(0, 30);
  const entries = await mapConcurrent(urls, 4, async (url) => [url, await fetchTrustedImage(url)] as const);
  return new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

async function fetchTrustedImage(rawUrl: string): Promise<string | null> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  const trusted = new Set(["www.nsd.md", "nsd.md"]);
  try { trusted.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local").hostname); } catch { /* optional */ }
  if (url.protocol !== "https:" || !trusted.has(url.hostname)) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !["image/png", "image/jpeg"].includes(type) || length > 1_000_000) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 1_000_000) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch { return null; } finally { clearTimeout(timer); }
}

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; output[index] = await mapper(items[index]); } }));
  return output;
}

export function countPdfPages(bytes: Uint8Array): number { const matches = Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g); return Math.max(1, matches?.length ?? 1); }
function money(value: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 2 }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
