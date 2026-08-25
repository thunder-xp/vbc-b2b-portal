"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { invalidInput, success, type ActionResult } from "../access-control/actions/action-result";
import { requireAdminPermission } from "../admin/services";
import { MAX_EXTERNAL_PRICE_FILE_SIZE } from "../external-prices/limits";
import { CompetitorRetailPricingRepository, CompetitorRetailPricingRepositoryError } from "./retail-pricing.repository";

const BUCKET = "external-price-imports";
const repository = new CompetitorRetailPricingRepository();

export async function prepareCompetitorRetailImportAction(input: { filename: string; size: number; hash: string }):
Promise<ActionResult<{ importId: string; storageKey: string; signedUrl: string }>> {
  try {
    const context = await requireAdminPermission("admin.market_intelligence.manage");
    const format = fileFormat(input.filename);
    if (!format || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_EXTERNAL_PRICE_FILE_SIZE || !/^[a-f0-9]{64}$/.test(input.hash)) {
      return invalidInput("Поддерживаются корректные XLSX/CSV файлы до 64 МБ.");
    }
    const importId = randomUUID();
    const storageKey = `admin-competitor-retail/${context.userId}/${importId}/${input.hash}.${format}`;
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(storageKey, { upsert: false });
    if (error) throw error;
    return success("Файл готов к защищённой загрузке.", { importId, storageKey, signedUrl: data.signedUrl });
  } catch (error) {
    console.error({ event: "competitor_retail_upload_prepare_failed", errorType: error instanceof Error ? error.name : typeof error });
    return invalidInput("Не удалось подготовить загрузку.");
  }
}

export async function finalizeCompetitorRetailImportAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  let storageKey: string | null = null;
  try {
    const context = await requireAdminPermission("admin.market_intelligence.manage");
    const importId = uuid(formData, "importId"), hash = required(formData, "hash").toLowerCase();
    const fileName = safeFilename(required(formData, "originalFilename")), format = fileFormat(fileName);
    if (!format || !/^[a-f0-9]{64}$/.test(hash)) return invalidInput();
    storageKey = `admin-competitor-retail/${context.userId}/${importId}/${hash}.${format}`;
    if (required(formData, "storageKey") !== storageKey) return invalidInput();
    const admin = createAdminClient();
    const { data: object, error: objectError } = await admin.storage.from(BUCKET).info(storageKey);
    if (objectError || typeof object?.size !== "number" || object.size < 1 || object.size > MAX_EXTERNAL_PRICE_FILE_SIZE) return invalidInput("Файл недоступен или превышает 64 МБ.");
    const currency = required(formData, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return invalidInput("Укажите валюту ISO.");
    const result = await repository.createImport({
      id: importId, competitorId: uuid(formData, "competitorId"), fileName, storageKey, hash, format,
      size: object.size, effectiveDate: date(formData, "effectiveDate"), currency,
      snapshotScope: enumValue(formData, "snapshotScope", ["full", "partial"] as const),
    });
    if (result.duplicate === true) await admin.storage.from(BUCKET).remove([storageKey]);
    revalidatePath("/admin/market-intelligence/price-lists");
    return success(result.duplicate === true ? "Этот файл уже зарегистрирован." : "Файл передан на анализ.", { id: String(result.id) });
  } catch (error) {
    if (storageKey) await createAdminClient().storage.from(BUCKET).remove([storageKey]);
    return adminFailure(error);
  }
}

export async function confirmCompetitorRetailMappingAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  const importId = uuid(formData, "importId");
  const mapping = {
    productCode: optionalColumn(formData, "productCode"),
    productName: column(formData, "productName"),
    description: optionalColumn(formData, "description"),
    partnerPrice: null,
    retailPrice: column(formData, "retailPrice"),
  };
  await repository.confirmMapping(importId, mapping);
  revalidatePath(`/admin/market-intelligence/price-lists/${importId}`);
}

export async function reviewCompetitorRetailRowAction(formData: FormData) {
  const importId = uuid(formData, "importId"), ignore = required(formData, "decision") === "ignore";
  try {
    await requireAdminPermission("admin.market_intelligence.manage");
    await repository.reviewRow(importId, uuid(formData, "rowId"), ignore ? null : uuid(formData, "productId"), ignore);
  } catch (error) {
    if (error instanceof CompetitorRetailPricingRepositoryError && error.code === "PT409") {
      redirect(`/admin/market-intelligence/price-lists/${importId}?notice=price_conflict`);
    }
    throw error;
  }
  revalidatePath(`/admin/market-intelligence/price-lists/${importId}`);
}

export async function applyCompetitorRetailImportAction(formData: FormData) {
  const importId = uuid(formData, "importId");
  try {
    await requireAdminPermission("admin.market_intelligence.manage");
    await repository.apply(importId);
  } catch (error) {
    if (error instanceof CompetitorRetailPricingRepositoryError && error.code === "PT409") {
      redirect(`/admin/market-intelligence/price-lists/${importId}?notice=price_conflict`);
    }
    throw error;
  }
  revalidatePath(`/admin/market-intelligence/price-lists/${importId}`);
  revalidatePath("/admin/market-intelligence");
  redirect(`/admin/market-intelligence/price-lists/${importId}?notice=applied`);
}

export async function archiveCompetitorRetailImportAction(formData: FormData) {
  await requireAdminPermission("admin.market_intelligence.manage");
  const importId = uuid(formData, "importId");
  await repository.archive(importId);
  revalidatePath("/admin/market-intelligence/price-lists");
}

export async function searchAdminCompetitorProductsAction(query: string): Promise<ActionResult<Array<{ id: string; sku: string; name: string }>>> {
  try {
    await requireAdminPermission("admin.market_intelligence.manage");
    const normalized = query.normalize("NFKC").trim();
    if (normalized.length < 2 || normalized.length > 100) return success("", []);
    const { data, error } = await createAdminClient().rpc("search_admin_competitor_mapping_products", { p_query: normalized, p_limit: 20 });
    if (error) throw error;
    const items = Array.isArray(data) ? data.flatMap((item) => item && typeof item === "object" ? [{
      id: String((item as Record<string, unknown>).id ?? ""), sku: String((item as Record<string, unknown>).sku ?? ""), name: String((item as Record<string, unknown>).name ?? ""),
    }] : []) : [];
    return success("", items);
  } catch {
    return invalidInput("Поиск временно недоступен.");
  }
}

function adminFailure(error: unknown): ActionResult<never> {
  if (error instanceof CompetitorRetailPricingRepositoryError && ["22023", "PT409"].includes(error.code ?? "")) return invalidInput("Проверьте данные и состояние импорта.");
  console.error({ event: "competitor_retail_import_action_failed", errorType: error instanceof Error ? error.name : typeof error });
  return invalidInput("Операция с прайс-листом не выполнена.");
}
function required(data: FormData, key: string) { const value = data.get(key); if (typeof value !== "string" || !value.trim()) throw new Error("INVALID_INPUT"); return value.trim(); }
function uuid(data: FormData, key: string) { const value = required(data, key); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("INVALID_INPUT"); return value; }
function date(data: FormData, key: string) { const value = required(data, key); if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_INPUT"); return value; }
function enumValue<const T extends readonly string[]>(data: FormData, key: string, values: T): T[number] { const value = required(data, key); if (!values.includes(value)) throw new Error("INVALID_INPUT"); return value as T[number]; }
function fileFormat(name: string) { const value = name.toLowerCase().split(".").pop(); return value === "xlsx" || value === "csv" ? value : null; }
function safeFilename(name: string) { return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "price-list"; }
function column(data: FormData, key: string) { const value = required(data, key).toUpperCase(); if (!/^[A-Z]{1,3}$/.test(value)) throw new Error("INVALID_COLUMN"); return value; }
function optionalColumn(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" && value.trim() ? column(data, key) : null; }
