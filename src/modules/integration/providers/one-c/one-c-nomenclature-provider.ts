import type { CatalogCategoryDTO, CatalogProductAttributeDTO, CatalogProductDTO, CatalogScanDiagnosticsDTO, CatalogSnapshotDTO, ExternalReferenceDTO } from "../../dto";
import { IntegrationValidationError } from "../../errors";
import { isOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const RESOURCE = "Catalog_Номенклатура";
const ROOT_NAME = "SECURITYPARK DISTRIBUTION";
const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const ORDERING = "Ref_Key asc";
const PROPERTY_RESOURCE = "ChartOfCharacteristicTypes_ДополнительныеРеквизитыИСведения";
const VALUE_RESOURCES = ["Catalog_ЗначенияСвойствОбъектов", "Catalog_ЗначенияСвойствОбъектовИерархия"] as const;
const PHOTO_PROPERTY_REF = "f637e5a4-4c2b-11ec-bd80-7239d3b7bd5c";
const FIELDS = ["Ref_Key", "Parent_Key", "IsFolder", "DeletionMark", "DataVersion", "ДатаИзменения", "Code", "Артикул", "Description", "НаименованиеПолное", "Комментарий", "ФайлКартинки_Key", "ДополнительныеРеквизиты", "PS_ВидНоменклатурыБУ", "ЭтоНабор", "Недействителен"].join(",");
const PROPERTY_FIELDS = ["Ref_Key", "Description", "DeletionMark", "DataVersion", "ValueType", "Виден", "Доступен", "Заголовок", "Имя", "НаборСвойств_Key"].join(",");
const VALUE_FIELDS = ["Ref_Key", "Description", "Owner_Key", "DeletionMark"].join(",");

export class CatalogScanIncompleteError extends IntegrationValidationError { readonly failedStage = "nomenclature_scan"; readonly errorCategory = "scan_incomplete"; constructor() { super("1C nomenclature scan is incomplete."); this.name = "CatalogScanIncompleteError"; } }
export class CatalogDuplicateRowsError extends IntegrationValidationError { readonly failedStage = "nomenclature_scan"; readonly errorCategory = "duplicate_page_rows"; constructor() { super("1C nomenclature scan contains duplicate references."); this.name = "CatalogDuplicateRowsError"; } }

type AdditionalRequisite = { propertyRef: string; value: unknown; valueType: string | null; textValue: string | null };
type PropertyDefinition = { reference: string; description: string; title: string; valueType: string | null; deleted: boolean; visible: boolean; available: boolean };
export type NormalizedNomenclatureRow = { reference: string; parentReference: string | null; isFolder: boolean; deleted: boolean; inactive: boolean; sourceVersion: string | null; sourceModifiedAt: string | null; code: string; article: string; name: string; fullName: string; comment: string; requisites: AdditionalRequisite[]; accountingType: string; setValue: boolean | null };

export class OneCNomenclatureODataProvider {
  private readonly client: OneCODataClient;
  constructor(config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) { this.client = new OneCODataClient(config); }

  async fetchFullSnapshot(onPageProcessed?: (pageNumber: number, rowCount: number) => void): Promise<CatalogSnapshotDTO> {
    const rows: NormalizedNomenclatureRow[] = [];
    const diagnostics = emptyDiagnostics();
    let pagesProcessed = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(RESOURCE, { "$select": FIELDS, "$orderby": ORDERING, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "catalog_nomenclature_scan" });
      const values = parseEnvelope(payload);
      diagnostics.totalRowsScanned += values.length;
      diagnostics.lastPageRowCount = values.length;
      for (const value of values) { const parsed = parseRow(value, diagnostics); if (parsed) rows.push(parsed); }
      pagesProcessed += 1;
      onPageProcessed?.(pagesProcessed, values.length);
      if (values.length < PAGE_SIZE) { diagnostics.scanComplete = true; break; }
    }
    if (!diagnostics.scanComplete) throw new CatalogScanIncompleteError();
    const references = new Set<string>();
    for (const row of rows) { const key = row.reference.toLowerCase(); if (references.has(key)) diagnostics.duplicateReferenceCount += 1; else references.add(key); }
    diagnostics.uniqueRowsScanned = references.size;
    if (diagnostics.duplicateReferenceCount > 0) throw new CatalogDuplicateRowsError();
    const propertyDefinitions = await this.fetchPropertyDefinitions();
    diagnostics.propertyDefinitionsLoaded = propertyDefinitions.size;
    const requiredValueRefs = new Set(rows.flatMap((row) => row.requisites.flatMap((item) => isGuidLike(item.value) ? [String(item.value).toLowerCase()] : [])));
    const resolvedValues = await this.resolveReferenceValuesBatch(requiredValueRefs);
    const roots = rows.filter((row) => row.isFolder && !row.deleted && !row.inactive && row.name === ROOT_NAME);
    if (roots.length !== 1) throw new IntegrationValidationError(roots.length ? "1C catalog root is ambiguous." : "1C catalog root was not found.");
    return buildNomenclatureSnapshot(rows, roots[0]!.reference, ROOT_NAME, pagesProcessed, diagnostics, propertyDefinitions, resolvedValues);
  }

  private async fetchPropertyDefinitions(): Promise<Map<string, PropertyDefinition>> {
    const definitions = new Map<string, PropertyDefinition>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(PROPERTY_RESOURCE, { "$select": PROPERTY_FIELDS, "$orderby": ORDERING, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "catalog_property_definition_scan" });
      const values = parseEnvelope(payload);
      for (const value of values) { const definition = parsePropertyDefinition(value); if (definition) definitions.set(definition.reference.toLowerCase(), definition); }
      if (values.length < PAGE_SIZE) return definitions;
    }
    throw new CatalogScanIncompleteError();
  }

  private async resolveReferenceValuesBatch(requiredRefs: Set<string>): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    if (!requiredRefs.size) return resolved;
    for (const resource of VALUE_RESOURCES) for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(resource, { "$select": VALUE_FIELDS, "$orderby": ORDERING, "$top": String(PAGE_SIZE), "$skip": String(page * PAGE_SIZE) }, { requestKind: "catalog_attribute_value_scan" });
      const values = parseEnvelope(payload);
      for (const value of values) if (isRecord(value) && typeof value.Ref_Key === "string" && typeof value.Owner_Key === "string" && requiredRefs.has(value.Ref_Key.toLowerCase()) && value.DeletionMark !== true && text(value.Description)) resolved.set(`${value.Owner_Key.toLowerCase()}:${value.Ref_Key.toLowerCase()}`, text(value.Description));
      if (values.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) throw new CatalogScanIncompleteError();
    }
    return resolved;
  }
}

export function buildNomenclatureSnapshot(rows: NormalizedNomenclatureRow[], rootReference: string, rootName: string, pagesProcessed: number, baseDiagnostics: CatalogScanDiagnosticsDTO = emptyDiagnostics(), propertyDefinitions = new Map<string, PropertyDefinition>(), resolvedValues = new Map<string, string>()): CatalogSnapshotDTO {
  const diagnostics = { ...baseDiagnostics, accountingTypeCounts: { ...baseDiagnostics.accountingTypeCounts }, setValueCounts: { ...baseDiagnostics.setValueCounts } };
  const rootKey = rootReference.toLowerCase();
  const allowed = new Set([rootKey]);
  let changed = true;
  while (changed) { changed = false; for (const row of rows) if (row.parentReference && allowed.has(row.parentReference.toLowerCase()) && !allowed.has(row.reference.toLowerCase())) { allowed.add(row.reference.toLowerCase()); changed = true; } }
  const descendants = rows.filter((row) => row.reference.toLowerCase() !== rootKey && allowed.has(row.reference.toLowerCase()));
  diagnostics.rowsWithParentEqualRoot = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey).length;
  diagnostics.directChildFolders = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey && row.isFolder && !row.deleted && !row.inactive).length;
  diagnostics.directChildProducts = rows.filter((row) => row.parentReference?.toLowerCase() === rootKey && !row.isFolder && isSellableProduct(row)).length;
  diagnostics.descendantFoldersResolved = descendants.filter((row) => row.isFolder && !row.deleted && !row.inactive).length;
  diagnostics.descendantProductsResolved = descendants.filter(isSellableProduct).length;
  diagnostics.eligibleProducts = diagnostics.descendantProductsResolved;
  diagnostics.excludedOutsideSubtree = rows.filter((row) => row.reference.toLowerCase() !== rootKey && !allowed.has(row.reference.toLowerCase())).length;
  diagnostics.excludedDeleted += descendants.filter((row) => row.deleted).length;
  diagnostics.excludedInactive += descendants.filter((row) => row.inactive).length;
  diagnostics.excludedService += descendants.filter((row) => !row.isFolder && !row.deleted && !row.inactive && row.accountingType !== "Товар").length;
  diagnostics.excludedSet += descendants.filter((row) => !row.isFolder && !row.deleted && !row.inactive && row.accountingType === "Товар" && row.setValue === true).length;
  const products = descendants.filter(isSellableProduct).map((row) => toProduct(row, propertyDefinitions, resolvedValues, diagnostics));
  return { rootReference: reference(rootReference, "catalog-category"), rootName, categories: descendants.filter((row) => row.isFolder && !row.deleted && !row.inactive).map(toCategory), products, pagesProcessed, rowsReceived: rows.length, diagnostics };
}

function isSellableProduct(row: NormalizedNomenclatureRow) { return !row.isFolder && !row.deleted && !row.inactive && row.name.length > 0 && row.accountingType === "Товар" && row.setValue !== true; }
function toCategory(row: NormalizedNomenclatureRow): CatalogCategoryDTO { return { reference: reference(row.reference, "catalog-category"), parentReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, name: row.name, slug: null, description: null, isActive: true, metadata: metadata(row) }; }
function toProduct(row: NormalizedNomenclatureRow, definitions: Map<string, PropertyDefinition>, resolvedValues: Map<string, string>, diagnostics: CatalogScanDiagnosticsDTO): CatalogProductDTO {
  const attributes = normalizeAttributes(row.requisites, definitions, resolvedValues, diagnostics);
  const imageUrl = extractImageUrl(row.requisites, diagnostics);
  const descriptionProperty = attributes.find((item) => normalizeLabel(item.label) === "описание")?.displayValue ?? null;
  const fullDescription = normalizeDescription(descriptionProperty || row.comment || row.fullName || null);
  const shortDescription = firstParagraph(fullDescription) || normalizeDescription(row.fullName || row.name);
  if (imageUrl) diagnostics.productsWithImageUrl = (diagnostics.productsWithImageUrl ?? 0) + 1; else diagnostics.productsWithoutImageUrl = (diagnostics.productsWithoutImageUrl ?? 0) + 1;
  if (fullDescription) diagnostics.productsWithFullDescription = (diagnostics.productsWithFullDescription ?? 0) + 1;
  if (attributes.length) diagnostics.productsWithAttributes = (diagnostics.productsWithAttributes ?? 0) + 1;
  diagnostics.attributeRowsReceived = (diagnostics.attributeRowsReceived ?? 0) + row.requisites.length;
  diagnostics.filterableAttributeRows = (diagnostics.filterableAttributeRows ?? 0) + attributes.filter((item) => item.filterable).length;
  return { reference: reference(row.reference, "catalog-product"), categoryReference: row.parentReference ? reference(row.parentReference, "catalog-category") : null, brandReference: null, sku: row.article || row.code, name: row.name, slug: null, shortDescription, description: fullDescription, fullDescription, imageUrl, attributes, isActive: true, isVisible: true, metadata: metadata(row) };
}
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
  return { reference: value.Ref_Key, parentReference, isFolder, deleted: value.DeletionMark === true, inactive: value["Недействителен"] === true, sourceVersion: nullableText(value.DataVersion), sourceModifiedAt: nullableText(value["ДатаИзменения"]), code: text(value.Code), article: text(value["Артикул"]), name, fullName: text(value["НаименованиеПолное"]), comment: text(value["Комментарий"]), requisites: parseRequisites(value["ДополнительныеРеквизиты"]), accountingType, setValue };
}

function parsePropertyDefinition(value: unknown): PropertyDefinition | null {
  if (!isRecord(value) || typeof value.Ref_Key !== "string" || !isOneCGuid(value.Ref_Key)) return null;
  return { reference: value.Ref_Key, description: text(value.Description), title: text(value["Заголовок"]), valueType: nullableText(value.ValueType), deleted: value.DeletionMark === true, visible: value["Виден"] !== false, available: value["Доступен"] !== false };
}
function parseRequisites(value: unknown): AdditionalRequisite[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item["Свойство_Key"] !== "string" || !isOneCGuid(item["Свойство_Key"])) return [];
    return [{ propertyRef: item["Свойство_Key"], value: item["Значение"], valueType: nullableText(item["Значение_Type"]), textValue: nullableText(item["ТекстоваяСтрока"]) }];
  });
}
function extractImageUrl(requisites: AdditionalRequisite[], diagnostics: CatalogScanDiagnosticsDTO): string | null {
  const item = requisites.find((entry) => entry.propertyRef.toLowerCase() === PHOTO_PROPERTY_REF);
  if (!item || (item.valueType && item.valueType !== "Edm.String")) return null;
  const candidate = typeof item.value === "string" ? item.value.trim() : "";
  try { const url = new URL(candidate); if (url.protocol !== "https:" || !["firebasestorage.googleapis.com", "storage.googleapis.com"].includes(url.hostname.toLowerCase())) throw new Error(); return url.toString(); }
  catch { if (candidate) diagnostics.invalidImageUrls = (diagnostics.invalidImageUrls ?? 0) + 1; return null; }
}
function normalizeAttributes(requisites: AdditionalRequisite[], definitions: Map<string, PropertyDefinition>, resolvedValues: Map<string, string>, diagnostics: CatalogScanDiagnosticsDTO): CatalogProductAttributeDTO[] {
  return requisites.flatMap((item) => {
    if (item.propertyRef.toLowerCase() === PHOTO_PROPERTY_REF) return [];
    const definition = definitions.get(item.propertyRef.toLowerCase());
    if (!definition || definition.deleted || !definition.visible) return [];
    const rawValue = normalizeAttributeValue(item.value, item.textValue, item.valueType);
    if (rawValue === null) return [];
    const label = definition.title || definition.description;
    if (!label) return [];
    const referenceValue = isGuidLike(rawValue) ? String(rawValue).toLowerCase() : null;
    const resolvedDisplayValue = referenceValue ? resolvedValues.get(`${item.propertyRef.toLowerCase()}:${referenceValue}`) ?? null : null;
    const resolutionStatus = referenceValue ? (resolvedDisplayValue ? "resolved" : "unresolved") : "not_required";
    if (referenceValue) diagnostics.referenceValuesDetected = (diagnostics.referenceValuesDetected ?? 0) + 1;
    if (resolutionStatus === "resolved") diagnostics.referenceValuesResolved = (diagnostics.referenceValuesResolved ?? 0) + 1;
    if (resolutionStatus === "unresolved") { diagnostics.referenceValuesUnresolved = (diagnostics.referenceValuesUnresolved ?? 0) + 1; diagnostics.attributesHiddenUnresolved = (diagnostics.attributesHiddenUnresolved ?? 0) + 1; }
    const displayValue = resolvedDisplayValue ?? (referenceValue ? "" : typeof rawValue === "boolean" ? (rawValue ? "Да" : "Нет") : normalizeTypedDisplayValue(rawValue, item.valueType));
    if (!displayValue && !referenceValue) return [];
    return [{ propertyRef: item.propertyRef, key: `property_${item.propertyRef.toLowerCase()}`, label, rawValue, displayValue, resolvedDisplayValue, resolvedValueRef: referenceValue, resolutionStatus, valueType: item.valueType || definition.valueType, filterable: resolutionStatus !== "unresolved" && isFilterable(label, rawValue, displayValue, definition), visible: definition.visible && resolutionStatus !== "unresolved", available: definition.available }];
  });
}
export function isGuidLike(value: unknown): boolean { return typeof value === "string" && isOneCGuid(value.trim()); }
function normalizeTypedDisplayValue(value: string | number | boolean, valueType: string | null): string { if (valueType?.includes("Date") && typeof value === "string") { const date = new Date(value); if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("ru").format(date); } return String(value).trim(); }
function normalizeAttributeValue(value: unknown, textValue: string | null, valueType: string | null): string | number | boolean | null {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (textValue) return textValue;
  if (valueType?.toLowerCase().includes("boolean")) return false;
  return null;
}
function isFilterable(label: string, rawValue: string | number | boolean, displayValue: string, definition: PropertyDefinition): boolean {
  if (!definition.available || !definition.visible || /^https?:\/\//i.test(displayValue) || displayValue.length > 80) return false;
  const normalized = normalizeLabel(label);
  if (/(invoice|счет|лид|lead|штрих|barcode|workflow|служеб|сервис)/i.test(normalized)) return false;
  return typeof rawValue !== "string" || displayValue.length <= 40;
}
function normalizeDescription(value: string | null): string | null {
  if (!value) return null;
  const withoutUnsafeBlocks = value.replace(/<(script|style|iframe|object|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutUnsafeBlocks.replace(/<\s*br\s*\/?\s*>|<\/\s*p\s*>/gi, "\n");
  const plain = decodeBasicEntities(withBreaks.replace(/<[^>]+>/g, " ")).replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return plain ? plain.slice(0, 12000) : null;
}
function firstParagraph(value: string | null): string | null { if (!value) return null; return (value.split(/\n\s*\n|\n/)[0]?.trim() || null)?.slice(0, 320) ?? null; }
function decodeBasicEntities(value: string): string { return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'"); }
function normalizeLabel(value: string): string { return value.trim().toLowerCase(); }

function emptyDiagnostics(): CatalogScanDiagnosticsDTO { return { configuredOrdering: ORDERING, totalRowsScanned: 0, uniqueRowsScanned: 0, duplicateReferenceCount: 0, folderRowsScanned: 0, productRowsScanned: 0, validParentReferences: 0, rowsWithParentEqualRoot: 0, directChildFolders: 0, directChildProducts: 0, descendantFoldersResolved: 0, descendantProductsResolved: 0, eligibleProducts: 0, excludedDeleted: 0, excludedInactive: 0, excludedInvalidGuid: 0, excludedService: 0, excludedSet: 0, excludedEmptyName: 0, excludedOutsideSubtree: 0, accountingTypeCounts: {}, setValueCounts: { true: 0, false: 0, missing: 0 }, pageSize: PAGE_SIZE, lastPageRowCount: 0, scanComplete: false }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown): string | null { const normalized = text(value); return normalized || null; }

export const ONE_C_NOMENCLATURE_FIELDS = FIELDS.split(",");
export const ONE_C_CATALOG_ROOT_NAME = ROOT_NAME;
export { OneCNomenclatureODataProvider as OneCNomenclatureCatalogProvider };
