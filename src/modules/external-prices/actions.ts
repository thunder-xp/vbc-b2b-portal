"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../access-control/actions/action-result";
import { getPartnerWorkspaceContextAction } from "../partner-cabinet/actions";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { MAX_EXTERNAL_PRICE_FILE_SIZE } from "./limits";
import { ExternalPriceRepository } from "./repository";
import { ExternalPriceService } from "./service";
import type { ExternalPriceColumnMapping, ExternalPriceFileFormat } from "./types";

const BUCKET = "external-price-imports";

export async function prepareExternalPriceUploadAction(input: {
  filename: string;
  size: number;
  hash: string;
}): Promise<ActionResult<{ uploadId: string; storageKey: string; signedUrl: string }>> {
  try {
    const contextResult = await getPartnerWorkspaceContextAction();
    if (!contextResult.success) return contextResult;
    const companyId = new ExternalPriceService().assertCompanyContext(contextResult.data);
    if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_EXTERNAL_PRICE_FILE_SIZE) return invalidInput("Поддерживаются файлы до 64 МБ.");
    const format = fileFormat(input.filename);
    if (!format) return invalidInput("Поддерживаются только XLSX и CSV.");
    if (!/^[a-f0-9]{64}$/.test(input.hash)) return invalidInput("Не удалось проверить файл.");
    const uploadId = randomUUID();
    const storageKey = `${companyId}/${uploadId}/${input.hash}.${format}`;
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(storageKey, { upsert: false });
    if (error) throw error;
    return success("Файл готов к защищённой загрузке.", { uploadId, storageKey, signedUrl: data.signedUrl });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function finalizeExternalPriceUploadAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  let uploadedKey: string | null = null;
  try {
    const contextResult = await getPartnerWorkspaceContextAction();
    if (!contextResult.success) return contextResult;
    const companyId = new ExternalPriceService().assertCompanyContext(contextResult.data);
    const uploadId = required(formData, "uploadId");
    const hash = required(formData, "hash").toLowerCase();
    const originalFilename = required(formData, "originalFilename");
    const format = fileFormat(originalFilename);
    if (!format || !/^[a-f0-9]{64}$/.test(hash) || !/^[0-9a-f-]{36}$/i.test(uploadId)) return invalidInput();
    uploadedKey = `${companyId}/${uploadId}/${hash}.${format}`;
    if (required(formData, "storageKey") !== uploadedKey) return invalidInput();
    const admin = createAdminClient();
    const { data: object, error: objectError } = await admin.storage.from(BUCKET).info(uploadedKey);
    const objectSize = object?.size;
    if (objectError || typeof objectSize !== "number" || objectSize < 1 || objectSize > MAX_EXTERNAL_PRICE_FILE_SIZE) return invalidInput("Загруженный файл недоступен или превышает 64 МБ.");
    const sourceId = required(formData, "sourceId");
    const priceSchema = enumValue(formData, "priceSchema", ["partner", "retail", "both", "detect"] as const);
    const snapshotScope = enumValue(formData, "snapshotScope", ["full", "partial"] as const);
    const currency = required(formData, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return invalidInput("Укажите трёхбуквенный код валюты.");
    const effectiveDate = optional(formData, "effectiveDate");
    if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return invalidInput("Дата прайса указана неверно.");
    const result = await new ExternalPriceRepository().createUpload({
      companyId,
      sourceId,
      uploadId,
      originalFilename: safeFilename(originalFilename),
      storageKey: uploadedKey,
      hash,
      format,
      size: objectSize,
      effectiveDate,
      currency,
      priceSchema,
      snapshotScope,
    });
    if (result.duplicate) await admin.storage.from(BUCKET).remove([uploadedKey]);
    revalidatePath("/cabinet/competitor-prices");
    return success("Файл принят и передан на анализ.", { id: result.id });
  } catch (error) {
    if (uploadedKey) await createAdminClient().storage.from(BUCKET).remove([uploadedKey]);
    return failureFromError(error);
  }
}

export async function confirmExternalPriceMappingAction(formData: FormData): Promise<void> {
  const { companyId } = await context();
  const uploadId = required(formData, "uploadId");
  const mapping: ExternalPriceColumnMapping = {
    productCode: optional(formData, "productCode"),
    productName: required(formData, "productName").toUpperCase(),
    description: optional(formData, "description")?.toUpperCase() ?? null,
    partnerPrice: optional(formData, "partnerPrice")?.toUpperCase() ?? null,
    retailPrice: optional(formData, "retailPrice")?.toUpperCase() ?? null,
  };
  validateColumns(mapping);
  await new ExternalPriceRepository().confirmMapping(companyId, uploadId, mapping, formData.get("saveTemplate") === "on");
  revalidatePath(`/cabinet/competitor-prices/${uploadId}`);
}

export async function reviewExternalPriceRowAction(formData: FormData): Promise<void> {
  const { companyId } = await context();
  const uploadId = required(formData, "uploadId"), rowId = required(formData, "rowId");
  const skip = formData.get("decision") === "skip";
  await new ExternalPriceRepository().reviewRow(companyId, uploadId, rowId, skip ? null : required(formData, "productId"), skip);
  revalidatePath(`/cabinet/competitor-prices/${uploadId}`);
}

export async function applyExternalPriceUploadAction(formData: FormData): Promise<void> { const { companyId } = await context(); const id = required(formData, "uploadId"); await new ExternalPriceRepository().apply(companyId, id); revalidatePath(`/cabinet/competitor-prices/${id}`); }
export async function archiveExternalPriceUploadAction(formData: FormData): Promise<void> { const { companyId } = await context(); const id = required(formData, "uploadId"); await new ExternalPriceRepository().archive(companyId, id); revalidatePath("/cabinet/competitor-prices"); }

async function context() { const result = await getPartnerWorkspaceContextAction(); if (!result.success) throw new Error(result.errorCode); return { companyId: new ExternalPriceService().assertCompanyContext(result.data) }; }
function required(data: FormData, key: string) { const value = data.get(key); if (typeof value !== "string" || !value.trim()) throw new Error("INVALID_INPUT"); return value.trim(); }
function optional(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; }
function enumValue<T extends readonly string[]>(data: FormData, key: string, values: T): T[number] { const value = required(data, key); if (!values.includes(value)) throw new Error("INVALID_INPUT"); return value as T[number]; }
function fileFormat(name: string): ExternalPriceFileFormat | null { const ext = name.toLowerCase().split(".").pop(); return ext === "xlsx" || ext === "csv" ? ext : null; }
function safeFilename(name: string) { return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "price-list"; }
function validateColumns(mapping: ExternalPriceColumnMapping) { for (const value of Object.values(mapping)) { if (value && !/^[A-Z]{1,3}$/.test(value)) throw new Error("INVALID_COLUMN"); } if (!mapping.partnerPrice && !mapping.retailPrice) throw new Error("PRICE_COLUMN_REQUIRED"); }
