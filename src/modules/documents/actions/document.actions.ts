"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { requireAdminPermission } from "../../admin/services";
import { DOCUMENT_TYPES, type AdminDocumentPage, type DocumentBuilderProduct, type DocumentHealth, type PartnerDocumentDetail, type PartnerDocumentFilters, type PartnerDocumentPage, type PartnerDocumentType, type PortalProductDocumentInput } from "../types";
import { validateProductDocumentFile } from "../services";
import { createDocumentService } from "./service-factory";
import { documentFailure, documentSuccess, type DocumentActionResult } from "./result";

export async function listPartnerDocumentsAction(filters: PartnerDocumentFilters = {}): Promise<DocumentActionResult<PartnerDocumentPage>> {
  try { return documentSuccess(await createDocumentService().listPartner(await getAuthenticatedUserId(), filters), "Документы загружены."); }
  catch (error) { return fail(error, "Не удалось загрузить документы. Обновите страницу позже.", "partner_documents_list_failed"); }
}
export async function getPartnerDocumentAction(documentId: string): Promise<DocumentActionResult<PartnerDocumentDetail>> {
  try { const data = await createDocumentService().getPartner(await getAuthenticatedUserId(), documentId); return data ? documentSuccess(data, "Документ загружен.") : documentFailure("Документ недоступен."); }
  catch (error) { return fail(error, "Документ недоступен.", "partner_document_detail_failed"); }
}
export async function listOrderDocumentsAction(orderId: string): Promise<DocumentActionResult<PartnerDocumentPage>> {
  try { return documentSuccess(await createDocumentService().listForOrder(await getAuthenticatedUserId(), orderId), "Документы заказа загружены."); }
  catch (error) { return fail(error, "Документы заказа временно недоступны.", "order_documents_failed"); }
}
export async function listProductDocumentsAction(productId: string): Promise<DocumentActionResult<PartnerDocumentPage>> {
  try { return documentSuccess(await createDocumentService().listForProduct(await getAuthenticatedUserId(), productId), "Документы товара загружены."); }
  catch (error) { return fail(error, "Документы товара временно недоступны.", "product_documents_failed"); }
}
export async function listAdminDocumentsAction(query = "", page = 1): Promise<DocumentActionResult<AdminDocumentPage>> { await requireAdminPermission("admin.documents.view"); return documentSuccess(await createDocumentService().listAdmin(query, page), "Документы загружены."); }
export async function getDocumentHealthAction(): Promise<DocumentActionResult<DocumentHealth>> { await requireAdminPermission("admin.documents.view"); return documentSuccess(await createDocumentService().getHealth(), "Диагностика загружена."); }
export async function getDocumentBuilderProductsAction(query = ""): Promise<DocumentActionResult<DocumentBuilderProduct[]>> { await requireAdminPermission("documents.manage_product_documents"); return documentSuccess(await createDocumentService().getBuilderProducts(query), "Товары загружены."); }

export async function uploadProductDocumentAction(_state: DocumentActionResult<{ id: string }> | null, formData: FormData): Promise<DocumentActionResult<{ id: string }>> {
  await requireAdminPermission("documents.manage_product_documents");
  const documentId = randomUUID(); let storageKey: string | null = null;
  try {
    const file = formData.get("file"); if (!(file instanceof File)) return documentFailure("Выберите PDF-файл.");
    const bytes = new Uint8Array(await file.arrayBuffer()); const validated = validateProductDocumentFile(bytes, file.type);
    const productIds = formData.getAll("productIds").filter((value): value is string => typeof value === "string");
    storageKey = `portal/${documentId}/${validated.checksum}.pdf`;
    const { error } = await createAdminClient().storage.from("partner-documents").upload(storageKey, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
    const documentType = text(formData,"documentType") as PartnerDocumentType;
    if (!DOCUMENT_TYPES.includes(documentType)) throw new Error("DOCUMENT_TYPE_INVALID");
    const input: PortalProductDocumentInput = { id: documentId, title: text(formData,"title"), description: optional(formData,"description"), documentType, languageCode: text(formData,"languageCode") as PortalProductDocumentInput["languageCode"], issueDate: optional(formData,"issueDate"), validFrom: optional(formData,"validFrom"), validUntil: optional(formData,"validUntil"), version: text(formData,"version"), fileName: safeFileName(file.name), mimeType: "application/pdf", fileSize: validated.size, storageBucket: "partner-documents", storageKey, checksumSha256: validated.checksum, productIds };
    const id = await createDocumentService().registerProductDocument(input);
    if (id !== documentId) {
      await createAdminClient().storage.from("partner-documents").remove([storageKey]);
      storageKey = null;
    }
    revalidatePath("/admin/documents"); revalidatePath("/cabinet/documents");
    return documentSuccess({ id }, "Документ опубликован.");
  } catch (error) {
    if (storageKey) await createAdminClient().storage.from("partner-documents").remove([storageKey]);
    return fail(error, "Не удалось опубликовать документ. Проверьте PDF, тип и выбранные товары.", "product_document_upload_failed");
  }
}
export async function archiveProductDocumentAction(documentId: string) { await requireAdminPermission("documents.manage_product_documents"); try { await createDocumentService().archiveProductDocument(documentId); revalidatePath("/admin/documents"); revalidatePath("/cabinet/documents"); return documentSuccess(true,"Документ архивирован."); } catch(error) { return fail(error,"Не удалось архивировать документ.","product_document_archive_failed"); } }

function text(form: FormData, key: string) { const value=form.get(key); return typeof value==="string"?value.trim():""; }
function optional(form: FormData,key:string){return text(form,key)||null;}
function safeFileName(value:string){const clean=value.normalize("NFKC").replace(/[\r\n"\\/]/g,"_").trim().slice(0,180);return clean.toLowerCase().endsWith(".pdf")?clean:`${clean||"document"}.pdf`;}
function fail<T>(error: unknown, message: string, event: string): DocumentActionResult<T> { const correlationId=randomUUID(); console.error({event,correlationId,errorType:error instanceof Error?error.name:typeof error}); return documentFailure(`${message} Код: ${correlationId}.`,correlationId); }
