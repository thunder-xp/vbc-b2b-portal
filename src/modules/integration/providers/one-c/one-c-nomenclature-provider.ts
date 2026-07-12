import type { CatalogCategoryDTO, CatalogProductDTO, CatalogSnapshotDTO, ExternalReferenceDTO } from "../../dto";
import { IntegrationValidationError } from "../../errors";
import { isOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const RESOURCE = "Catalog_Номенклатура";
const ROOT_NAME = "SECURITYPARK DISTRIBUTION";
const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const FIELDS = ["Ref_Key", "Parent_Key", "IsFolder", "DeletionMark", "DataVersion", "ДатаИзменения", "Code", "Артикул", "Description", "НаименованиеПолное", "PS_ВидНоменклатурыБУ", "ЭтоНабор"].join(",");

type NomenclatureRow = {
  reference: string;
  parentReference: string | null;
  isFolder: boolean;
  deleted: boolean;
  sourceVersion: string | null;
  sourceModifiedAt: string | null;
  code: string;
  article: string;
  name: string;
  fullName: string;
  accountingType: string;
  isSet: boolean;
};

export class OneCNomenclatureCatalogProvider {
  private readonly client: OneCODataClient;

  constructor(config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) {
    this.client = new OneCODataClient(config);
  }

  async fetchFullSnapshot(): Promise<CatalogSnapshotDTO> {
    const rows: NomenclatureRow[] = [];
    let pagesProcessed = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(RESOURCE, { "$select": FIELDS, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "catalog_nomenclature_scan" });
      const values = parseEnvelope(payload);
      rows.push(...values.flatMap((value) => { const row = parseRow(value); return row ? [row] : []; }));
      pagesProcessed += 1;
      if (values.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) throw new IntegrationValidationError("1C nomenclature page limit reached.");
    }

    const roots = rows.filter((row) => row.isFolder && !row.deleted && row.name.trim() === ROOT_NAME);
    if (roots.length !== 1) throw new IntegrationValidationError(roots.length ? "1C catalog root is ambiguous." : "1C catalog root was not found.");
    return buildSnapshot(rows, roots[0]!, pagesProcessed);
  }
}

function buildSnapshot(rows: NomenclatureRow[], root: NomenclatureRow, pagesProcessed: number): CatalogSnapshotDTO {
  const allowed = new Set([root.reference.toLowerCase()]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (row.parentReference && allowed.has(row.parentReference.toLowerCase()) && !allowed.has(row.reference.toLowerCase())) { allowed.add(row.reference.toLowerCase()); changed = true; }
  }
  const descendants = rows.filter((row) => row.reference !== root.reference && allowed.has(row.reference.toLowerCase()));
  return {
    rootReference: reference(root.reference, "catalog-category"),
    rootName: root.name,
    categories: descendants.filter((row) => row.isFolder && !row.deleted).map(toCategory),
    products: descendants.filter(isSellableProduct).map(toProduct),
    pagesProcessed,
    rowsReceived: rows.length,
  };
}

function isSellableProduct(row: NomenclatureRow): boolean { return !row.isFolder && !row.deleted && row.name.length > 0 && row.accountingType === "Товар" && !row.isSet; }
function toCategory(row: NomenclatureRow): CatalogCategoryDTO { return { reference: reference(row.reference, "catalog-category"), parentReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, name: row.name, slug: null, description: null, isActive: true, metadata: metadata(row) }; }
function toProduct(row: NomenclatureRow): CatalogProductDTO { return { reference: reference(row.reference, "catalog-product"), categoryReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, brandReference: null, sku: row.article || row.code, name: row.name, slug: null, shortDescription: null, description: row.fullName || null, imageUrl: null, isActive: true, isVisible: true, metadata: metadata(row) }; }
function reference(externalId: string, externalType: string): ExternalReferenceDTO { return { providerCode: "one-c", externalId, externalType }; }
function metadata(row: NomenclatureRow) { return { sourceReference: reference(row.reference, row.isFolder ? "catalog-category" : "catalog-product"), sourceUpdatedAt: row.sourceModifiedAt, importedAt: null, sourceVersion: row.sourceVersion }; }

function parseEnvelope(value: unknown): unknown[] { if (!isRecord(value) || !Array.isArray(value.value)) throw new IntegrationValidationError("1C nomenclature response is invalid."); return value.value; }
function parseRow(value: unknown): NomenclatureRow | null {
  if (!isRecord(value) || typeof value.Ref_Key !== "string" || !isOneCGuid(value.Ref_Key)) return null;
  const name = text(value.Description);
  if (!name) return null;
  return { reference: value.Ref_Key, parentReference: typeof value.Parent_Key === "string" && isOneCGuid(value.Parent_Key) ? value.Parent_Key : null, isFolder: value.IsFolder === true, deleted: value.DeletionMark === true, sourceVersion: nullableText(value.DataVersion), sourceModifiedAt: nullableText(value["ДатаИзменения"]), code: text(value.Code), article: text(value["Артикул"]), name, fullName: text(value["НаименованиеПолное"]), accountingType: text(value["PS_ВидНоменклатурыБУ"]), isSet: value["ЭтоНабор"] === true };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const normalized = text(value); return normalized || null; }

export const ONE_C_NOMENCLATURE_FIELDS = FIELDS.split(",");
export const ONE_C_CATALOG_ROOT_NAME = ROOT_NAME;
