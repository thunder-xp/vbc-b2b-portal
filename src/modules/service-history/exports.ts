import "server-only";

import { strToU8, zipSync } from "fflate";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import pdfMake from "pdfmake/build/pdfmake";
import robotoFonts from "pdfmake/build/vfs_fonts";

import { formatPartnerDate } from "../partner-locale/format";
import type { PartnerLocale } from "../partner-locale/locale";
import { partnerStatusLabel } from "../partner-locale/status-copy";
import type { ServiceMonthExport, ServiceMonthExportRow } from "./types";

type PdfMakeRuntime = {
  addVirtualFileSystem(vfs: unknown): void;
  setUrlAccessPolicy(callback: (url: string) => boolean): void;
  createPdf(definition: unknown): { getBuffer(): Promise<Buffer> };
};

const pdfRuntime = pdfMake as unknown as PdfMakeRuntime;
pdfRuntime.addVirtualFileSystem(robotoFonts);
pdfRuntime.setUrlAccessPolicy(() => false);

export function renderServiceStatementXlsx(data: ServiceMonthExport, locale: PartnerLocale): Uint8Array {
  const copy = exportCopy(locale);
  const rows: XlsxCell[][] = [
    [textCell(copy.title, 1)],
    [textCell(copy.partner, 2), textCell(data.companyName)],
    [textCell(copy.period, 2), textCell(formatMonth(data.month, locale))],
    [],
    copy.headers.map((value) => textCell(value, 2)),
    ...data.rows.map((row) => exportRow(row, locale)),
    [],
    [textCell(copy.totals, 1)],
    [textCell(copy.currency, 2), textCell(copy.count, 2), textCell(copy.amount, 2), textCell(copy.vat, 2)],
    ...data.totals.map((total) => [
      textCell(total.currency),
      numberCell(String(total.completedServiceCount)),
      numberCell(total.totalServiceAmount),
      numberCell(total.totalVatAmount),
    ]),
  ];
  const sheet = worksheetXml(rows);
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/app.xml": strToU8(appPropertiesXml()),
    "docProps/core.xml": strToU8(corePropertiesXml(copy.title)),
    "xl/workbook.xml": strToU8(workbookXml(copy.sheetName)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(stylesXml()),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  }, { level: 6 });
}

export async function renderServiceStatementPdf(data: ServiceMonthExport, locale: PartnerLocale): Promise<Uint8Array> {
  const copy = exportCopy(locale);
  const body: Array<Array<Record<string, unknown>>> = [
    copy.pdfHeaders.map((text) => ({ text, bold: true, fillColor: "#ecfdf5" })),
    ...data.rows.map((row) => [
      { text: row.documentNumber },
      { text: formatPartnerDate(row.completionDate, locale) },
      { text: [row.productSku, row.productName].filter(Boolean).join(" · ") || copy.notProvided },
      { text: row.maskedSerial ?? copy.notProvided },
      { text: row.workDescription ?? copy.notProvided },
      { text: partnerStatusLabel(locale, "service", row.status) },
      { text: row.contract ?? copy.notProvided },
      { text: row.serviceAmount !== null && row.currency ? formatDecimalMoney(row.serviceAmount, row.currency) : copy.notProvided, alignment: "right", noWrap: true },
      { text: row.vatAmount !== null && row.currency ? formatDecimalMoney(row.vatAmount, row.currency) : copy.notProvided, alignment: "right", noWrap: true },
    ]),
  ];
  const totals = data.totals.map((total) => ({
    columns: [
      { text: `${total.currency} · ${copy.count}: ${total.completedServiceCount}`, width: "*" },
      { text: `${copy.amount}: ${formatDecimalMoney(total.totalServiceAmount, total.currency)}`, width: "auto", margin: [12, 0, 0, 0] },
      { text: `${copy.vat}: ${formatDecimalMoney(total.totalVatAmount, total.currency)}`, width: "auto", margin: [12, 0, 0, 0] },
    ],
    margin: [0, 3, 0, 0],
  }));
  const definition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 28, 24, 32],
    defaultStyle: { font: "Roboto", fontSize: 7.2, color: "#27272a" },
    content: [
      { text: copy.title, fontSize: 17, bold: true, color: "#14532d" },
      { text: `${copy.partner}: ${data.companyName}`, margin: [0, 6, 0, 0] },
      { text: `${copy.period}: ${formatMonth(data.month, locale)}`, margin: [0, 2, 0, 8] },
      ...(data.rows.length ? [{
        table: { headerRows: 1, widths: [54, 52, 105, 60, "*", 58, 76, 62, 56], body },
        layout: {
          fillColor: (rowIndex: number) => rowIndex > 0 && rowIndex % 2 === 0 ? "#fafafa" : null,
          hLineColor: () => "#d4d4d8",
          vLineColor: () => "#e4e4e7",
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 3,
          paddingRight: () => 3,
        },
      }] : [{ text: copy.empty, italics: true, color: "#52525b", margin: [0, 12, 0, 12] }]),
      { text: copy.totals, bold: true, fontSize: 10, margin: [0, 10, 0, 2] },
      ...totals,
      { text: copy.nonAccounting, color: "#71717a", fontSize: 7, margin: [0, 12, 0, 0] },
    ],
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "right", color: "#71717a", fontSize: 7, margin: [0, 12, 24, 0] }),
    info: { title: `${copy.title} · ${data.month}`, author: "Novotech Systems", subject: copy.nonAccounting },
  } as unknown as TDocumentDefinitions;
  return new Uint8Array(await pdfRuntime.createPdf(definition).getBuffer());
}

export function serviceStatementFilename(month: string, extension: "xlsx" | "pdf") {
  return `service-summary-${month}.${extension}`;
}

type XlsxCell = { value: string; style?: number; numeric?: boolean };

function exportRow(row: ServiceMonthExportRow, locale: PartnerLocale): XlsxCell[] {
  return [
    textCell(row.documentNumber),
    textCell(formatPartnerDate(row.completionDate, locale)),
    textCell(row.productSku ?? ""),
    textCell(row.productName ?? ""),
    textCell(row.maskedSerial ?? ""),
    textCell(row.workDescription ?? ""),
    textCell(partnerStatusLabel(locale, "service", row.status)),
    textCell(row.contract ?? ""),
    row.serviceAmount === null ? textCell("") : numberCell(row.serviceAmount),
    row.vatAmount === null ? textCell("") : numberCell(row.vatAmount),
    textCell(row.currency ?? ""),
  ];
}

function textCell(value: string, style = 0): XlsxCell { return { value, style }; }
function numberCell(value: string): XlsxCell { return { value, numeric: /^-?\d+(?:\.\d+)?$/.test(value), style: 3 }; }

function worksheetXml(rows: XlsxCell[][]) {
  const rowXml = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
    if (cell.numeric) return `<c r="${ref}" s="${cell.style ?? 0}"><v>${cell.value}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${cell.style ?? 0}"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="2" width="16" customWidth="1"/><col min="3" max="5" width="20" customWidth="1"/><col min="6" max="8" width="30" customWidth="1"/><col min="9" max="11" width="15" customWidth="1"/></cols><sheetData>${rowXml}</sheetData><autoFilter ref="A5:K${Math.max(5, rows.length - dataTailLength(rows))}"/></worksheet>`;
}

function dataTailLength(rows: XlsxCell[][]) {
  const totalsIndex = rows.findIndex((row) => row[0]?.style === 1 && row.length === 1 && row !== rows[0]);
  return totalsIndex < 0 ? 0 : rows.length - totalsIndex;
}

function columnName(index: number) {
  let result = "";
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function contentTypesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`; }
function rootRelationshipsXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`; }
function workbookXml(sheetName: string) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`; }
function workbookRelationshipsXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`; }
function stylesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF14532D"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`; }
function appPropertiesXml() { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Novotech Platform</Application></Properties>`; }
function corePropertiesXml(title: string) { const now = new Date().toISOString(); return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>Novotech Systems</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`; }

function formatMonth(month: string, locale: PartnerLocale) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
}

function formatDecimalMoney(amount: string, currency: string) {
  const match = amount.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return `${amount} ${currency}`;
  const integer = match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  return `${match[1]}${integer},${fraction} ${currency}`;
}

function exportCopy(locale: PartnerLocale) {
  return locale === "ro" ? {
    title: "Sumar servicii", sheetName: "Servicii", partner: "Partener", period: "Perioadă", totals: "Totaluri",
    currency: "Valută", count: "Servicii", amount: "Total", vat: "Inclusiv TVA", notProvided: "Nu este indicat",
    empty: "Nu există servicii prestate în perioada selectată.", nonAccounting: "Rezumat operațional. Nu este document contabil.",
    headers: ["Document", "Data finalizării", "SKU", "Produs / model", "Serie", "Lucrări efectuate", "Statut", "Contract", "Total", "TVA", "Valută"],
    pdfHeaders: ["Document", "Data", "SKU / produs", "Serie", "Lucrări", "Statut", "Contract", "Total", "TVA"],
  } : {
    title: "Сводка сервисных услуг", sheetName: "Сервис", partner: "Партнёр", period: "Период", totals: "Итоги",
    currency: "Валюта", count: "Услуги", amount: "Итого", vat: "В т.ч. НДС", notProvided: "Не указано",
    empty: "За выбранный период оказанных сервисных услуг нет.", nonAccounting: "Операционная сводка. Не является бухгалтерским документом.",
    headers: ["Документ", "Дата выполнения", "SKU", "Товар / модель", "Серийный номер", "Выполненные работы", "Статус", "Договор", "Итого", "НДС", "Валюта"],
    pdfHeaders: ["Документ", "Дата", "SKU / товар", "Серия", "Работы", "Статус", "Договор", "Итого", "НДС"],
  };
}
