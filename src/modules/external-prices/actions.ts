"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../access-control/actions/action-result";
import { getPartnerWorkspaceContextAction } from "../partner-cabinet/actions";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { ExternalPriceRepository } from "./repository";
import { ExternalPriceService } from "./service";
import type { ExternalPriceColumnMapping, ExternalPriceFileFormat } from "./types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const BUCKET = "external-price-imports";

export async function uploadExternalPriceAction(_state: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  let uploadedKey: string | null = null;
  try {
    const contextResult = await getPartnerWorkspaceContextAction();
    if (!contextResult.success) return contextResult;
    const companyId = new ExternalPriceService().assertCompanyContext(contextResult.data);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_SIZE) return invalidInput("Поддерживаются файлы до 10 МБ.");
    const format = fileFormat(file.name);
    if (!format) return invalidInput("Поддерживаются только XLSX и CSV.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validContent(bytes, format)) return invalidInput("Содержимое файла не соответствует выбранному формату.");
    const sourceId = required(formData, "sourceId");
    const priceSchema = enumValue(formData, "priceSchema", ["partner","retail","both","detect"] as const);
    const snapshotScope = enumValue(formData, "snapshotScope", ["full","partial"] as const);
    const currency = required(formData,"currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return invalidInput("Укажите трёхбуквенный код валюты.");
    const effectiveDate = optional(formData,"effectiveDate");
    if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return invalidInput("Дата прайса указана неверно.");
    const uploadId = randomUUID();
    const hash = createHash("sha256").update(bytes).digest("hex");
    uploadedKey = `${companyId}/${uploadId}/${hash}.${format}`;
    const contentType = format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
    const { error: storageError } = await createAdminClient().storage.from(BUCKET).upload(uploadedKey, bytes, { contentType, upsert: false });
    if (storageError) throw storageError;
    const result = await new ExternalPriceRepository().createUpload({ companyId, sourceId, uploadId, originalFilename: safeFilename(file.name), storageKey: uploadedKey, hash, format, size: file.size, effectiveDate, currency, priceSchema, snapshotScope });
    if (result.duplicate) await createAdminClient().storage.from(BUCKET).remove([uploadedKey]);
    revalidatePath("/cabinet/competitor-prices");
    return success("Файл принят и передан на анализ.", { id: result.id });
  } catch (error) {
    if (uploadedKey) await createAdminClient().storage.from(BUCKET).remove([uploadedKey]);
    return failureFromError(error);
  }
}

export async function confirmExternalPriceMappingAction(formData: FormData): Promise<void> {
  const { companyId } = await context();
  const uploadId = required(formData,"uploadId");
  const mapping: ExternalPriceColumnMapping = { productCode: optional(formData,"productCode"), productName: required(formData,"productName").toUpperCase(), description: optional(formData,"description")?.toUpperCase() ?? null, partnerPrice: optional(formData,"partnerPrice")?.toUpperCase() ?? null, retailPrice: optional(formData,"retailPrice")?.toUpperCase() ?? null };
  validateColumns(mapping);
  await new ExternalPriceRepository().confirmMapping(companyId, uploadId, mapping, formData.get("saveTemplate")==="on");
  revalidatePath(`/cabinet/competitor-prices/${uploadId}`);
}

export async function reviewExternalPriceRowAction(formData: FormData): Promise<void> {
  const { companyId } = await context();
  const uploadId=required(formData,"uploadId"), rowId=required(formData,"rowId");
  const skip=formData.get("decision")==="skip";
  await new ExternalPriceRepository().reviewRow(companyId,uploadId,rowId,skip?null:required(formData,"productId"),skip);
  revalidatePath(`/cabinet/competitor-prices/${uploadId}`);
}

export async function applyExternalPriceUploadAction(formData: FormData): Promise<void> { const {companyId}=await context(); const id=required(formData,"uploadId"); await new ExternalPriceRepository().apply(companyId,id); revalidatePath(`/cabinet/competitor-prices/${id}`); }
export async function archiveExternalPriceUploadAction(formData: FormData): Promise<void> { const {companyId}=await context(); const id=required(formData,"uploadId"); await new ExternalPriceRepository().archive(companyId,id); revalidatePath("/cabinet/competitor-prices"); }

async function context(){const result=await getPartnerWorkspaceContextAction();if(!result.success)throw new Error(result.errorCode);return{companyId:new ExternalPriceService().assertCompanyContext(result.data)};}
function required(data:FormData,key:string){const value=data.get(key);if(typeof value!=="string"||!value.trim())throw new Error("INVALID_INPUT");return value.trim();}
function optional(data:FormData,key:string){const value=data.get(key);return typeof value==="string"&&value.trim()?value.trim():null;}
function enumValue<T extends readonly string[]>(data:FormData,key:string,values:T):T[number]{const value=required(data,key);if(!values.includes(value))throw new Error("INVALID_INPUT");return value as T[number];}
function fileFormat(name:string):ExternalPriceFileFormat|null{const ext=name.toLowerCase().split(".").pop();return ext==="xlsx"||ext==="csv"?ext:null;}
function validContent(bytes:Uint8Array,format:ExternalPriceFileFormat){if(format==="xlsx")return bytes.length>4&&bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;try{new TextDecoder("utf-8",{fatal:true}).decode(bytes);return !bytes.slice(0,1024).includes(0);}catch{return false;}}
function safeFilename(name:string){return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,180)||"price-list";}
function validateColumns(mapping:ExternalPriceColumnMapping){for(const value of Object.values(mapping)){if(value&&!/^[A-Z]{1,3}$/.test(value))throw new Error("INVALID_COLUMN");}if(!mapping.partnerPrice&&!mapping.retailPrice)throw new Error("PRICE_COLUMN_REQUIRED");}
