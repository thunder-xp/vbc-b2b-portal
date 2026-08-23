import "server-only";

import { createHash } from "node:crypto";

import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

import type {
  ExternalPriceColumnMapping,
  ExternalPriceDetectedMapping,
  ExternalPriceFileFormat,
  ExternalPriceSchema,
  ParsedExternalPriceRow,
  SpreadsheetAnalysis,
} from "./types";

const MAX_WORKSHEETS = 40;
const MAX_ROWS = 50_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_RELEVANT_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_CELL_LENGTH = 4_000;
const IDENTITY_COLUMNS = ["B", "C", "E"] as const;

export class ExternalPriceSpreadsheetError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ExternalPriceSpreadsheetError";
  }
}

type SheetMatrix = { name: string; rows: Map<number, Map<string, string>> };

export function analyzeExternalPriceSpreadsheet(input: {
  bytes: Uint8Array;
  format: ExternalPriceFileFormat;
  mapping?: ExternalPriceColumnMapping | null;
  priceSchema: ExternalPriceSchema;
}): SpreadsheetAnalysis {
  const sheets = input.format === "xlsx" ? parseXlsx(input.bytes) : [parseCsv(input.bytes)];
  const detectedMapping = detectMapping(sheets, input.priceSchema);
  const mapping = input.mapping ?? detectedMapping;
  const rows: ParsedExternalPriceRow[] = [];
  let totalRows = 0;
  let ignoredRows = 0;
  let markerRows = 0;

  for (const sheet of sheets) {
    for (const [rowNumber, cells] of sheet.rows) {
      if (totalRows >= MAX_ROWS) throw new ExternalPriceSpreadsheetError("ROW_LIMIT_EXCEEDED");
      const values = [...cells.values()].filter(Boolean);
      if (!values.length) continue;
      totalRows += 1;
      const mappedSourceName = value(cells, mapping.productName);
      const description = nullable(value(cells, mapping.description));
      const modelCell = findDahuaModelCell(cells, mapping.productName);
      const sourceName = modelCell?.value || mappedSourceName;
      const model = modelCell?.model ?? null;
      const partner = parsePrice(value(cells, mapping.partnerPrice));
      const retail = parsePrice(value(cells, mapping.retailPrice));
      if (!sourceName || (!partner.amount && partner.amount !== 0) && (!retail.amount && retail.amount !== 0)) {
        ignoredRows += 1;
        continue;
      }
      if (!model) {
        ignoredRows += 1;
        continue;
      }
      const marker = [partner.marker, retail.marker].filter(Boolean).join(" ") || null;
      if (marker) markerRows += 1;
      rows.push({
        sheet: sheet.name,
        row: rowNumber,
        sourceCode: nullable(value(cells, mapping.productCode)),
        sourceName,
        normalizedModel: normalizeProductModel(model),
        description,
        partnerPrice: partner.amount,
        retailPrice: retail.amount,
        marker,
      });
    }
  }

  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    totalRows,
    candidateRows: rows.length,
    ignoredRows,
    markerRows,
    detectedMapping,
    rows,
  };
}

export function parsePrice(raw: string): { amount: number | null; marker: string | null } {
  const normalized = raw.trim().replace(/\u00a0/g, " ");
  if (!normalized) return { amount: null, marker: null };
  const numeric = normalized.match(/[-+]?\d[\d\s]*(?:[.,]\d+)?/);
  if (!numeric) return { amount: null, marker: normalized.slice(0, 80) };
  const token = numeric[0].replace(/\s/g, "").replace(",", ".");
  const amount = Number(token);
  const marker = `${normalized.slice(0, numeric.index ?? 0)}${normalized.slice((numeric.index ?? 0) + numeric[0].length)}`.trim();
  return { amount: Number.isFinite(amount) ? amount : null, marker: marker || null };
}

export function normalizeProductModel(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ").replace(/\s*([/()\-])\s*/g, "$1");
}

export function extractDahuaModel(value: string): string | null {
  const normalized = value.normalize("NFKC").toUpperCase();
  const direct = normalized.match(/\b(?:DH|DHI)-[A-Z0-9]+(?:-[A-Z0-9]+)*(?:\s*\([A-Z0-9.-]+\))?/);
  if (direct) return direct[0].replace(/\s+(?=\()/, "");
  return null;
}

function parseXlsx(bytes: Uint8Array): SheetMatrix[] {
  validateZip(bytes);
  let archive: Record<string, Uint8Array>;
  try { archive = unzipSync(bytes, { filter: (file) => isRelevantXlsxPath(file.name) }); } catch { throw new ExternalPriceSpreadsheetError("INVALID_XLSX"); }
  const workbook = textFile(archive, "xl/workbook.xml");
  const relationships = textFile(archive, "xl/_rels/workbook.xml.rels");
  const sharedStrings = archive["xl/sharedStrings.xml"] ? parseSharedStrings(textFile(archive, "xl/sharedStrings.xml")) : [];
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g)) {
    targets.set(match[1], normalizeWorksheetTarget(match[2]));
  }
  const sheets: SheetMatrix[] = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"[^>]*\/?\s*>/g)) {
    if (sheets.length >= MAX_WORKSHEETS) throw new ExternalPriceSpreadsheetError("WORKSHEET_LIMIT_EXCEEDED");
    const target = targets.get(match[2]);
    if (!target || !archive[target]) continue;
    sheets.push({ name: decodeXml(match[1]).slice(0, 120), rows: parseWorksheet(textFile(archive, target), sharedStrings) });
  }
  if (!sheets.length) throw new ExternalPriceSpreadsheetError("NO_WORKSHEETS");
  return sheets;
}

function parseWorksheet(xml: string, sharedStrings: string[]): Map<number, Map<string, string>> {
  const rows = new Map<number, Map<string, string>>();
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] ?? rows.size + 1);
    const cells = new Map<string, string>();
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? cellMatch[2] ?? "";
      const body = cellMatch[3] ?? "";
      const reference = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!reference) continue;
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = type === "inlineStr"
        ? [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("")
        : decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      const resolved = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      if (resolved.trim()) cells.set(reference, resolved.trim().slice(0, MAX_CELL_LENGTH));
    }
    if (cells.size) rows.set(rowNumber, cells);
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });
  const parsed = parser.parse(xml) as { sst?: { si?: unknown | unknown[] } };
  const entries = array(parsed.sst?.si);
  return entries.map((entry) => collectText(entry).trim().slice(0, MAX_CELL_LENGTH));
}

function collectText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(collectText).join("");
  if (!value || typeof value !== "object") return "";
  return Object.entries(value).filter(([key]) => key === "t" || key === "r").map(([, child]) => collectText(child)).join("");
}

function parseCsv(bytes: Uint8Array): SheetMatrix {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text.slice(0, 8_000));
  const records: string[][] = [];
  let field = "", row: string[] = [], quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index] ?? "\n";
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === delimiter || char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim().slice(0, MAX_CELL_LENGTH)); field = "";
      if (char !== delimiter) { if (row.some(Boolean)) records.push(row); row = []; if (records.length > MAX_ROWS) throw new ExternalPriceSpreadsheetError("ROW_LIMIT_EXCEEDED"); }
      continue;
    }
    field += char;
  }
  const rows = new Map<number, Map<string, string>>();
  records.forEach((record, index) => rows.set(index + 1, new Map(record.map((cell, column) => [columnName(column + 1), cell]))));
  return { name: "CSV", rows };
}

function detectMapping(sheets: SheetMatrix[], priceSchema: ExternalPriceSchema): ExternalPriceDetectedMapping {
  const samples = sheets.flatMap((sheet) => [...sheet.rows.values()].slice(0, 200));
  const columns = new Set(samples.flatMap((row) => [...row.keys()]));
  const stats = [...columns].map((column) => ({
    column,
    model: samples.filter((row) => extractDahuaModel(value(row, column))).length,
    price: samples.filter((row) => isPriceLike(value(row, column))).length,
    text: samples.filter((row) => /[A-Za-zА-Яа-я]/.test(value(row, column))).length,
    modelRows: samples.filter((row) => findDahuaModelCell(row) && isPriceLike(value(row, column))).length,
  }));
  const modelColumn = stats.sort((a, b) => b.model - a.model || b.text - a.text)[0]?.column ?? "C";
  const modelIndex = columnIndex(modelColumn);
  const priceColumns = stats
    .filter((item) => columnIndex(item.column) > modelIndex && item.price > 0)
    .sort((a, b) => b.modelRows - a.modelRows || b.price - a.price || a.column.localeCompare(b.column));
  const primaryPrice = priceColumns[0]?.column ?? "F";
  const secondaryPrice = priceColumns[1]?.column ?? null;
  const productCode = stats
    .filter((item) => columnIndex(item.column) < modelIndex && item.modelRows > 0)
    .sort((a, b) => b.modelRows - a.modelRows || a.column.localeCompare(b.column))[0]?.column ?? previousColumn(modelColumn);
  const mapping: ExternalPriceDetectedMapping = {
    productCode,
    productName: modelColumn,
    description: nextColumn(modelColumn),
    partnerPrice: priceSchema === "retail" ? null : primaryPrice,
    retailPrice: priceSchema === "retail" ? primaryPrice : priceSchema === "both" ? secondaryPrice : null,
    signature: createHash("sha256").update(JSON.stringify({ sheets: sheets.map((sheet) => sheet.name), columns: [...columns].sort() })).digest("hex").slice(0, 32),
    confidence: priceSchema === "detect" ? "low" : stats.find((item) => item.column === modelColumn)?.model ? "medium" : "low",
  };
  if (priceSchema === "retail") mapping.partnerPrice = null;
  return mapping;
}

function validateZip(bytes: Uint8Array): void {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ExternalPriceSpreadsheetError("INVALID_XLSX");
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (read32(bytes, index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new ExternalPriceSpreadsheetError("INVALID_XLSX");
  const entries = read16(bytes, eocd + 10);
  const centralOffset = read32(bytes, eocd + 16);
  if (entries > MAX_ARCHIVE_ENTRIES) throw new ExternalPriceSpreadsheetError("ARCHIVE_ENTRY_LIMIT_EXCEEDED");
  let offset = centralOffset, total = 0, relevantTotal = 0;
  for (let count = 0; count < entries; count += 1) {
    if (read32(bytes, offset) !== 0x02014b50) throw new ExternalPriceSpreadsheetError("INVALID_XLSX");
    total += read32(bytes, offset + 24);
    if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) throw new ExternalPriceSpreadsheetError("UNCOMPRESSED_SIZE_LIMIT_EXCEEDED");
    const nameLength = read16(bytes, offset + 28), extraLength = read16(bytes, offset + 30), commentLength = read16(bytes, offset + 32);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) throw new ExternalPriceSpreadsheetError("UNSAFE_ARCHIVE_PATH");
    if (isRelevantXlsxPath(name)) {
      relevantTotal += read32(bytes, offset + 24);
      if (relevantTotal > MAX_RELEVANT_UNCOMPRESSED_BYTES) throw new ExternalPriceSpreadsheetError("RELEVANT_CONTENT_SIZE_LIMIT_EXCEEDED");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function findDahuaModelCell(cells: Map<string, string>, mappedColumn?: string | null): { value: string; model: string } | null {
  const columns = [mappedColumn?.toUpperCase(), ...IDENTITY_COLUMNS].filter((column, index, all): column is string => Boolean(column) && all.indexOf(column) === index);
  for (const column of columns) {
    const cell = value(cells, column);
    const model = extractDahuaModel(cell);
    if (model) return { value: cell, model };
  }
  return null;
}

function isPriceLike(raw: string): boolean {
  const normalized = raw.trim().replace(/\u00a0/g, " ");
  if (!normalized || normalized.length > 80 || !/^[-+]?\d/.test(normalized)) return false;
  return parsePrice(normalized).amount !== null;
}

function isRelevantXlsxPath(path: string): boolean {
  return path === "xl/workbook.xml"
    || path === "xl/_rels/workbook.xml.rels"
    || path === "xl/sharedStrings.xml"
    || /^xl\/worksheets\/sheet\d+\.xml$/i.test(path);
}

function textFile(archive: Record<string, Uint8Array>, path: string): string {
  const bytes = archive[path];
  if (!bytes) throw new ExternalPriceSpreadsheetError("INVALID_XLSX_STRUCTURE");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function normalizeWorksheetTarget(target: string): string { return `xl/${target.replace(/^\/?xl\//, "").replace(/\\/g, "/")}`; }
function decodeXml(value: string): string { return value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))); }
function value(row: Map<string, string>, column?: string | null): string { return column ? row.get(column.toUpperCase())?.trim() ?? "" : ""; }
function nullable(value: string): string | null { return value ? value : null; }
function array(value: unknown | unknown[] | undefined): unknown[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function read16(bytes: Uint8Array, offset: number): number { return bytes[offset] | bytes[offset + 1] << 8; }
function read32(bytes: Uint8Array, offset: number): number { return (read16(bytes, offset) | read16(bytes, offset + 2) << 16) >>> 0; }
function columnName(index: number): string { let result=""; while(index){index-=1;result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26);} return result; }
function columnIndex(name: string): number { return [...name].reduce((sum,char)=>sum*26+char.charCodeAt(0)-64,0); }
function previousColumn(name: string): string | null { const index=columnIndex(name); return index>1?columnName(index-1):null; }
function nextColumn(name: string): string { return columnName(columnIndex(name)+1); }
function detectDelimiter(value: string): string { const first=value.split(/\r?\n/,10); const delimiters=[",",";","\t"]; return delimiters.sort((a,b)=>first.reduce((n,line)=>n+line.split(b).length-1,0)-first.reduce((n,line)=>n+line.split(a).length-1,0))[0]; }
