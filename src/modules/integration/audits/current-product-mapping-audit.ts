import "server-only";

import { createHash } from "node:crypto";

import { getOneCEnv } from "@/src/lib/env";
import { createAdminClient } from "@/src/lib/supabase/admin";

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_RESOURCE = "Catalog_Номенклатура";
const CHARACTERISTIC_RESOURCE = "Catalog_ХарактеристикиНоменклатуры";
const PRODUCT_SELECT = [
  "Ref_Key", "Parent_Key", "IsFolder", "DeletionMark", "Недействителен",
  "PS_ВидНоменклатурыБУ", "ЭтоНабор", "DataVersion", "ДатаИзменения",
].join(",");
const CHARACTERISTIC_SELECT = "Ref_Key,Owner_Key,DeletionMark,DataVersion";
const MAX_PAGE_SIZE = 50;
const LOOKUP_CONCURRENCY = 8;
const MAX_PARENT_DEPTH = 32;

export type ProductMappingClassification =
  | "active_exact_match_available"
  | "inactive_exact_match_available"
  | "characteristic_requires_base_resolution"
  | "outside_portal_scope"
  | "deleted_source_product"
  | "superseded_reference"
  | "legacy_namespace"
  | "malformed_source_reference"
  | "current_1c_missing"
  | "ambiguous_conflict"
  | "portal_mapping_defect";

type ProductEvidence = {
  reference: string;
  parentReference: string | null;
  isFolder: boolean;
  deleted: boolean;
  inactive: boolean;
  accountingType: string | null;
  isSet: boolean | null;
  sourceVersion: string | null;
  sourceModifiedAt: string | null;
};

type CharacteristicEvidence = {
  reference: string;
  ownerReference: string | null;
  deleted: boolean;
  sourceVersion: string | null;
};

type SourceInventory = {
  reference: string;
  characteristicReferences: string[];
  sourceDocumentTypes: string[];
  sourceOrderReferences: string[];
  earliestOccurrence: string;
  latestOccurrence: string;
  affectedCompanyCount: number;
  affectedOrderCount: number;
  affectedLineCount: number;
  quantityTotal: number;
  postedOrderCount: number;
  deletedOrderCount: number;
  sourcePublicationTimestamp: string | null;
  localIngestionTimestamp: string;
  exactPortalProductId: string | null;
};

export type ProductMappingAuditRecord = SourceInventory & {
  safeReferenceFingerprint: string;
  classification: ProductMappingClassification;
  sourceExists: boolean;
  sourceActive: boolean;
  sourceInsidePortalRoot: boolean | null;
  sourceVersion: string | null;
  sourceModifiedAt: string | null;
  characteristicEvidence: Array<{
    safeReferenceFingerprint: string;
    exists: boolean;
    ownerMatchesProduct: boolean | null;
    deleted: boolean | null;
  }>;
  evidenceCode: string;
  internalSourceReference: string;
};

export type ProductMappingAuditPage = {
  status: "completed" | "partial";
  deployedCommitSha: string;
  offset: number;
  limit: number;
  totalReferences: number;
  totalAffectedLines: number;
  totalAffectedOrders: number;
  totalAffectedCompanies: number;
  rootReferenceFingerprint: string;
  sourceLookupDurationMs: number;
  localClassificationDurationMs: number;
  nextOffset: number | null;
  classifications: Partial<Record<ProductMappingClassification, number>>;
  records: ProductMappingAuditRecord[];
};

type OrderRow = {
  id: string;
  company_id: string;
  external_1c_order_ref: string;
  origin_type: string;
  one_c_document_date: string;
  one_c_posted: boolean;
  one_c_deletion_mark: boolean;
  one_c_last_synced_at: string;
};

type ItemRow = {
  order_history_id: string;
  external_product_ref: string;
  external_characteristic_ref: string | null;
  quantity: number | string;
  created_at: string;
};

type LookupResult<T> = { status: "found"; value: T } | { status: "missing" };

export async function runCurrentProductMappingAuditPage(input: {
  offset: number;
  limit: number;
}): Promise<ProductMappingAuditPage> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, input.limit));
  const offset = Math.max(0, input.offset);
  const inventoryStartedAt = performance.now();
  const { inventory, rootReference, totalAffectedOrders, totalAffectedCompanies } = await loadSourceInventory();
  const selected = inventory.slice(offset, offset + limit);
  const config = getOneCEnv();
  if (!config.baseUrl || !config.username || !config.password) {
    throw new Error("1C audit credentials are unavailable.");
  }
  const client = new AuditOneCClient(config);
  const productCache = new Map<string, Promise<LookupResult<ProductEvidence>>>();
  const characteristicCache = new Map<string, Promise<LookupResult<CharacteristicEvidence>>>();
  const sourceLookupStartedAt = performance.now();

  const records = await mapConcurrent(selected, LOOKUP_CONCURRENCY, async (source) => {
    const product = await cachedProductLookup(client, productCache, source.reference);
    const characteristicEvidence = await Promise.all(source.characteristicReferences.map(async (reference) => {
      const result = await cachedCharacteristicLookup(client, characteristicCache, reference);
      return {
        safeReferenceFingerprint: fingerprint(reference),
        exists: result.status === "found",
        ownerMatchesProduct: result.status === "found"
          ? result.value.ownerReference?.toLowerCase() === source.reference.toLowerCase()
          : null,
        deleted: result.status === "found" ? result.value.deleted : null,
      };
    }));
    const ancestry = product.status === "found"
      ? await resolveAncestry(client, productCache, product.value, rootReference)
      : { insideRoot: null, complete: true };
    const decision = classifyProductMappingEvidence({
      reference: source.reference,
      product: product.status === "found" ? product.value : null,
      ancestry,
      characteristicEvidence,
      exactPortalProductExists: source.exactPortalProductId !== null,
    });
    return {
      ...source,
      safeReferenceFingerprint: fingerprint(source.reference),
      classification: decision.classification,
      sourceExists: product.status === "found",
      sourceActive: product.status === "found" && !product.value.deleted && !product.value.inactive,
      sourceInsidePortalRoot: ancestry.insideRoot,
      sourceVersion: product.status === "found" ? product.value.sourceVersion : null,
      sourceModifiedAt: product.status === "found" ? product.value.sourceModifiedAt : null,
      characteristicEvidence,
      evidenceCode: decision.evidenceCode,
      internalSourceReference: source.reference,
    } satisfies ProductMappingAuditRecord;
  });
  const sourceLookupDurationMs = performance.now() - sourceLookupStartedAt;
  const classifications: Partial<Record<ProductMappingClassification, number>> = {};
  for (const record of records) classifications[record.classification] = (classifications[record.classification] ?? 0) + 1;

  return {
    status: offset + records.length >= inventory.length ? "completed" : "partial",
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    offset,
    limit,
    totalReferences: inventory.length,
    totalAffectedLines: inventory.reduce((sum, item) => sum + item.affectedLineCount, 0),
    totalAffectedOrders,
    totalAffectedCompanies,
    rootReferenceFingerprint: fingerprint(rootReference),
    sourceLookupDurationMs: Math.round(sourceLookupDurationMs),
    localClassificationDurationMs: Math.round(performance.now() - inventoryStartedAt - sourceLookupDurationMs),
    nextOffset: offset + records.length < inventory.length ? offset + records.length : null,
    classifications,
    records,
  };
}

export function classifyProductMappingEvidence(input: {
  reference: string;
  product: ProductEvidence | null;
  ancestry: { insideRoot: boolean | null; complete: boolean };
  characteristicEvidence: Array<{ exists: boolean; ownerMatchesProduct: boolean | null; deleted: boolean | null }>;
  exactPortalProductExists?: boolean;
}): { classification: ProductMappingClassification; evidenceCode: string } {
  if (!isNonZeroGuid(input.reference)) return { classification: "malformed_source_reference", evidenceCode: "invalid_product_guid" };
  if (!input.product) {
    const authoritativeOwner = input.characteristicEvidence.some((item) => item.exists && item.ownerMatchesProduct === false);
    return authoritativeOwner
      ? { classification: "characteristic_requires_base_resolution", evidenceCode: "characteristic_owner_differs" }
      : { classification: "current_1c_missing", evidenceCode: "nomenclature_element_not_found" };
  }
  if (input.product.deleted) return { classification: "deleted_source_product", evidenceCode: "nomenclature_deletion_mark" };
  if (input.product.inactive) return { classification: "inactive_exact_match_available", evidenceCode: "nomenclature_inactive" };
  if (input.exactPortalProductExists) return { classification: "active_exact_match_available", evidenceCode: "exact_portal_reference_available" };
  if (!input.ancestry.complete) return { classification: "ambiguous_conflict", evidenceCode: "incomplete_parent_chain" };
  if (!input.ancestry.insideRoot || input.product.isFolder || input.product.accountingType !== "Товар" || input.product.isSet === true) {
    return { classification: "outside_portal_scope", evidenceCode: "not_sellable_portal_descendant" };
  }
  if (input.characteristicEvidence.some((item) => item.exists && item.ownerMatchesProduct === false)) {
    return { classification: "ambiguous_conflict", evidenceCode: "characteristic_owner_conflict" };
  }
  return { classification: "portal_mapping_defect", evidenceCode: "active_sellable_descendant_missing_locally" };
}

async function loadSourceInventory(): Promise<{
  inventory: SourceInventory[];
  rootReference: string;
  totalAffectedOrders: number;
  totalAffectedCompanies: number;
}> {
  const client = createAdminClient();
  const items: ItemRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("partner_order_history_items")
      .select("order_history_id,external_product_ref,external_characteristic_ref,quantity,created_at")
      .is("product_id", null)
      .range(from, from + 999);
    if (error) throw new Error(`Source inventory failed: ${error.code ?? "database_error"}`);
    items.push(...(data as ItemRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const orderIds = [...new Set(items.map((item) => item.order_history_id))];
  const orders: OrderRow[] = [];
  for (let index = 0; index < orderIds.length; index += 100) {
    const { data, error } = await client.from("partner_order_history")
      .select("id,company_id,external_1c_order_ref,origin_type,one_c_document_date,one_c_posted,one_c_deletion_mark,one_c_last_synced_at")
      .in("id", orderIds.slice(index, index + 100));
    if (error) throw new Error(`Order inventory failed: ${error.code ?? "database_error"}`);
    orders.push(...(data as OrderRow[]));
  }
  const { data: state, error: stateError } = await client.from("catalog_sync_state")
    .select("root_external_1c_id")
    .eq("id", "daily_catalog")
    .single();
  if (stateError || !isNonZeroGuid(state?.root_external_1c_id)) throw new Error("Catalog root is unavailable.");
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const sourceReferences = [...new Set(items.map((item) => item.external_product_ref.trim().toLowerCase()))];
  const exactPortalProducts = new Map<string, string>();
  for (let index = 0; index < sourceReferences.length; index += 100) {
    const { data, error } = await client.from("catalog_products")
      .select("id,external_1c_id")
      .in("external_1c_id", sourceReferences.slice(index, index + 100));
    if (error) throw new Error(`Portal product inventory failed: ${error.code ?? "database_error"}`);
    for (const product of data ?? []) exactPortalProducts.set(product.external_1c_id.toLowerCase(), product.id);
  }
  const grouped = new Map<string, { items: ItemRow[]; orders: Map<string, OrderRow> }>();
  for (const item of items) {
    const reference = item.external_product_ref.trim().toLowerCase();
    const group = grouped.get(reference) ?? { items: [] as ItemRow[], orders: new Map<string, OrderRow>() };
    group.items.push(item);
    const order = orderById.get(item.order_history_id);
    if (order) group.orders.set(order.id, order);
    grouped.set(reference, group);
  }
  const inventory = [...grouped.entries()].map(([reference, group]) => {
    const occurrences = group.orders.size
      ? [...group.orders.values()].map((order) => order.one_c_document_date)
      : group.items.map((item) => item.created_at);
    const ingestion = group.items.map((item) => item.created_at).sort();
    const sourceOrders = [...group.orders.values()];
    return {
      reference,
      characteristicReferences: [...new Set(group.items.flatMap((item) => isNonZeroGuid(item.external_characteristic_ref) ? [item.external_characteristic_ref!.toLowerCase()] : []))],
      sourceDocumentTypes: [...new Set(sourceOrders.map((order) => order.origin_type))],
      sourceOrderReferences: sourceOrders.map((order) => order.external_1c_order_ref),
      earliestOccurrence: [...occurrences].sort()[0]!,
      latestOccurrence: [...occurrences].sort().at(-1)!,
      affectedCompanyCount: new Set(sourceOrders.map((order) => order.company_id)).size,
      affectedOrderCount: sourceOrders.length,
      affectedLineCount: group.items.length,
      quantityTotal: group.items.reduce((sum, item) => sum + Number(item.quantity), 0),
      postedOrderCount: sourceOrders.filter((order) => order.one_c_posted).length,
      deletedOrderCount: sourceOrders.filter((order) => order.one_c_deletion_mark).length,
      sourcePublicationTimestamp: sourceOrders.map((order) => order.one_c_last_synced_at).sort().at(-1) ?? null,
      localIngestionTimestamp: ingestion.at(-1)!,
      exactPortalProductId: exactPortalProducts.get(reference) ?? null,
    } satisfies SourceInventory;
  }).sort((left, right) => left.reference.localeCompare(right.reference));
  return {
    inventory,
    rootReference: state.root_external_1c_id.toLowerCase(),
    totalAffectedOrders: orders.length,
    totalAffectedCompanies: new Set(orders.map((order) => order.company_id)).size,
  };
}

class AuditOneCClient {
  constructor(private readonly config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number }) {}

  async product(reference: string): Promise<LookupResult<ProductEvidence>> {
    const result = await this.read(PRODUCT_RESOURCE, reference, PRODUCT_SELECT);
    if (!result) return { status: "missing" };
    return { status: "found", value: {
      reference: text(result.Ref_Key).toLowerCase(),
      parentReference: guidOrNull(result.Parent_Key),
      isFolder: result.IsFolder === true,
      deleted: result.DeletionMark === true,
      inactive: result["Недействителен"] === true,
      accountingType: nullableText(result["PS_ВидНоменклатурыБУ"]),
      isSet: typeof result["ЭтоНабор"] === "boolean" ? result["ЭтоНабор"] : null,
      sourceVersion: nullableText(result.DataVersion),
      sourceModifiedAt: nullableText(result["ДатаИзменения"]),
    } };
  }

  async characteristic(reference: string): Promise<LookupResult<CharacteristicEvidence>> {
    const result = await this.read(CHARACTERISTIC_RESOURCE, reference, CHARACTERISTIC_SELECT);
    if (!result) return { status: "missing" };
    return { status: "found", value: {
      reference: text(result.Ref_Key).toLowerCase(),
      ownerReference: guidOrNull(result.Owner_Key),
      deleted: result.DeletionMark === true,
      sourceVersion: nullableText(result.DataVersion),
    } };
  }

  private async read(resource: string, reference: string, select: string): Promise<Record<string, unknown> | null> {
    if (!isNonZeroGuid(reference) || !this.config.baseUrl || !this.config.username || !this.config.password) return null;
    const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/${resource}(guid'${reference}')`);
    url.searchParams.set("$select", select);
    url.searchParams.set("$format", "json");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`, "utf8").toString("base64")}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`1C product audit failed with HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!isRecord(value) || text(value.Ref_Key).toLowerCase() !== reference.toLowerCase()) throw new Error("1C product audit response is invalid.");
    return value;
  }
}

async function resolveAncestry(
  client: AuditOneCClient,
  cache: Map<string, Promise<LookupResult<ProductEvidence>>>,
  product: ProductEvidence,
  rootReference: string,
): Promise<{ insideRoot: boolean | null; complete: boolean }> {
  let current: ProductEvidence | null = product;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_PARENT_DEPTH && current; depth += 1) {
    const key = current.reference.toLowerCase();
    if (key === rootReference) return { insideRoot: true, complete: true };
    if (seen.has(key)) return { insideRoot: null, complete: false };
    seen.add(key);
    if (!current.parentReference || current.parentReference === ZERO_GUID) return { insideRoot: false, complete: true };
    const parent = await cachedProductLookup(client, cache, current.parentReference);
    if (parent.status === "missing") return { insideRoot: null, complete: false };
    current = parent.value;
  }
  return { insideRoot: null, complete: false };
}

function cachedProductLookup(client: AuditOneCClient, cache: Map<string, Promise<LookupResult<ProductEvidence>>>, reference: string) {
  const key = reference.toLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;
  const request = client.product(key);
  cache.set(key, request);
  return request;
}

function cachedCharacteristicLookup(client: AuditOneCClient, cache: Map<string, Promise<LookupResult<CharacteristicEvidence>>>, reference: string) {
  const key = reference.toLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;
  const request = client.characteristic(key);
  cache.set(key, request);
  return request;
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index]!);
    }
  }));
  return result;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 16);
}

function isNonZeroGuid(value: unknown): value is string {
  return typeof value === "string" && GUID.test(value.trim()) && value.trim().toLowerCase() !== ZERO_GUID;
}

function guidOrNull(value: unknown): string | null {
  return isNonZeroGuid(value) ? value.trim().toLowerCase() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
