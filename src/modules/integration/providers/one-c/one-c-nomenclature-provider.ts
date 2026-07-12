import type { CatalogCategoryDTO, CatalogProductDTO, CatalogScanDiagnosticsDTO, CatalogSnapshotDTO, ExternalReferenceDTO } from "../../dto";
import { IntegrationValidationError } from "../../errors";
import { isOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const RESOURCE = "Catalog_Номенклатура";
const ROOT_NAME = "SECURITYPARK DISTRIBUTION";
const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const FIELDS = ["Ref_Key", "Parent_Key", "IsFolder", "DeletionMark", "DataVersion", "ДатаИзменения", "Code", "Артикул", "Description", "НаименованиеПолное", "PS_ВидНоменклатурыБУ", "ЭтоНабор"].join(",");

export class CatalogScanIncompleteError extends IntegrationValidationError { readonly failedStage = "nomenclature_scan"; readonly errorCategory = "scan_incomplete"; constructor() { super("1C nomenclature scan is incomplete."); this.name = "CatalogScanIncompleteError"; } }

export type NormalizedNomenclatureRow = { reference: string; parentReference: string | null; isFolder: boolean; deleted: boolean; sourceVersion: string | null; sourceModifiedAt: string | null; code: string; article: string; name: string; fullName: string; accountingType: string; setValue: boolean | null };

export class OneCNomenclatureODataProvider {
  private readonly client: OneCODataClient;
  constructor(config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) { this.client = new OneCODataClient(config); }

  async fetchFullSnapshot(onPageProcessed?: (pageNumber: number, rowCount: number) => void): Promise<CatalogSnapshotDTO> {
    const rows: NormalizedNomenclatureRow[] = [];
    const diagnostics = emptyDiagnostics();
    let pagesProcessed = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(RESOURCE, { "$select": FIELDS, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "catalog_nomenclature_scan" });
      const values = parseEnvelope(payload);
      diagnostics.totalRowsScanned += values.length;
      diagnostics.lastPageRowCount = values.length;
      for (const value of values) { const parsed = parseRow(value, diagnostics); if (parsed) rows.push(parsed); }
      pagesProcessed += 1;
      onPageProcessed?.(pagesProcessed, values.length);
      if (values.length < PAGE_SIZE) { diagnostics.scanComplete = true; break; }
    }
    if (!diagnostics.scanComplete) throw new CatalogScanIncompleteError();
    const roots = rows.filter((row) => row.isFolder && !row.deleted && row.name === ROOT_NAME);
    if (roots.length !== 1) throw new IntegrationValidationError(roots.length ? "1C catalog root is ambiguous." : "1C catalog root was not found.");
    return buildNomenclatureSnapshot(rows, roots[0]!.reference, ROOT_NAME, pagesProcessed, diagnostics);
  }
}

export function buildNomenclatureSnapshot(rows: NormalizedNomenclatureRow[], rootReference: string, rootName: string, pagesProcessed: number, baseDiagnostics: CatalogScanDiagnosticsDTO = emptyDiagnostics()): CatalogSnapshotDTO {
  const diagnostics = { ...baseDiagnostics, accountingTypeCounts: { ...baseDiagnostics.accountingTypeCounts }, setValueCounts: { ...baseDiagnostics.setValueCounts } };
  const rootKey = rootReference.toLowerCase();
  const allowed = new Set([rootKey]);
  let changed = true;
  while (changed) { changed = false; for (const row of rows) if (row.parentReference && allowed.has(row.parentReference.toLowerCase()) && !allowed.has(row.reference.toLowerCase())) { allowed.add(row.reference.toLowerCase()); changed = true; } }
  const descendants = rows.filter((row) => row.reference.toLowerCase() !== rootKey && allowed.has(row.reference.toLowerCase()));
  diagnostics.rowsWithParentEqualRoot = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey).length;
  diagnostics.directChildFolders = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey && row.isFolder && !row.deleted).length;
  diagnostics.directChildProducts = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey && !row.isFolder && isSellableProduct(row)).length;
  diagnostics.descendantFoldersResolved = descendants.filter((row) => row.isFolder && !row.deleted).length;
  diagnostics.descendantProductsResolved = descendants.filter(isSellableProduct).length;
  diagnostics.excludedOutsideSubtree = rows.filter((row) => row.reference.toLowerCase() !== rootKey && !allowed.has(row.reference.toLowerCase())).length;
  diagnostics.excludedDeleted += descendants.filter((row) => row.deleted).length;
  diagnostics.excludedService += descendants.filter((row) => !row.isFolder && !row.deleted && row.accountingType !== "Товар").length;
  diagnostics.excludedSet += descendants.filter((row) => !row.isFolder && !row.deleted && row.accountingType === "Товар" && row.setValue === true).length;
  return { rootReference: reference(rootReference, "catalog-category"), rootName, categories: descendants.filter((row) => row.isFolder && !row.deleted).map(toCategory), products: descendants.filter(isSellableProduct).map(toProduct), pagesProcessed, rowsReceived: rows.length, diagnostics };
}

function isSellableProduct(row: NormalizedNomenclatureRow) { return !row.isFolder && !row.deleted && row.name.length > 0 && row.accountingType === "Товар" && row.setValue !== true; }
function toCategory(row: NormalizedNomenclatureRow): CatalogCategoryDTO { return { reference: reference(row.reference, "catalog-category"), parentReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, name: row.name, slug: null, description: null, isActive: true, metadata: metadata(row) }; }
function toProduct(row: NormalizedNomenclatureRow): CatalogProductDTO { return { reference: reference(row.reference, "catalog-product"), categoryReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, brandReference: null, sku: row.article || row.code, name: row.name, slug: null, shortDescription: null, description: row.fullName || null, imageUrl: null, isActive: true, isVisible: true, metadata: metadata(row) }; }
function reference(externalId: string, externalType: string): ExternalReferenceDTO { return { providerCode: "one-c", externalId, externalType }; }
function metadata(row: NormalizedNomenclatureRow) { return { sourceReference: reference(row.reference, row.isFolder ? "catalog-category" : "catalog-product"), sourceUpdatedAt: row.sourceModifiedAt, importedAt: null, sourceVersion: row.sourceVersion }; }
function parseEnvelope(value: unknown): unknown[] { if (!isRecord(value) || !Array.isArray(value.value)) throw new IntegrationValidationError("1C nomenclature response is invalid."); return value.value; }

function parseRow(value: unknown, diagnostics: CatalogScanDiagnosticsDTO): NormalizedNomenclatureRow | null {
  if (!isRecord(value) || typeof value.Ref_Key !== "string" || !isOneCGuid(value.Ref_Key)) { diagnostics.excludedInvalidGuid += 1; return null; }
  const name = text(value.Description); if (!name) { diagnostics.excludedEmptyName += 1; return null; }
  const isFolder = value.IsFolder === true; if (isFolder) diagnostics.folderRowsScanned += 1; else diagnostics.productRowsScanned += 1;
  const parentReference = typeof value.Parent_Key === "string" && isOneCGuid(value.Parent_Key) ? value.Parent_Key : null; if (parentReference) diagnostics.validParentReferences += 1;
  const accountingType = text(value["PS_ВидНоменклатурыБУ"]); diagnostics.accountingTypeCounts[accountingType || "missing"] = (diagnostics.accountingTypeCounts[accountingType || "missing"] ?? 0) + 1;
  const setValue = typeof value["ЭтоНабор"] === "boolean" ? value["ЭтоНабор"] as boolean : null; diagnostics.setValueCounts[setValue === null ? "missing" : String(setValue) as "true" | "false"] += 1;
  return { reference: value.Ref_Key, parentReference, isFolder, deleted: value.DeletionMark === true, sourceVersion: nullableText(value.DataVersion), sourceModifiedAt: nullableText(value["ДатаИзменения"]), code: text(value.Code), article: text(value["Артикул"]), name, fullName: text(value["НаименованиеПолное"]), accountingType, setValue };
}

function emptyDiagnostics(): CatalogScanDiagnosticsDTO { return { totalRowsScanned: 0, folderRowsScanned: 0, productRowsScanned: 0, validParentReferences: 0, rowsWithParentEqualRoot: 0, directChildFolders: 0, directChildProducts: 0, descendantFoldersResolved: 0, descendantProductsResolved: 0, excludedDeleted: 0, excludedInvalidGuid: 0, excludedService: 0, excludedSet: 0, excludedEmptyName: 0, excludedOutsideSubtree: 0, accountingTypeCounts: {}, setValueCounts: { true: 0, false: 0, missing: 0 }, pageSize: PAGE_SIZE, lastPageRowCount: 0, scanComplete: false }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const normalized = text(value); return normalized || null; }

export const ONE_C_NOMENCLATURE_FIELDS = FIELDS.split(",");
export const ONE_C_CATALOG_ROOT_NAME = ROOT_NAME;
export { OneCNomenclatureODataProvider as OneCNomenclatureCatalogProvider };
