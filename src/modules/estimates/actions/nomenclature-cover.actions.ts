"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { failureFromError, invalidInput, success, type ActionResult } from "@/src/modules/access-control/actions/action-result";

import { createEstimateService, getAuthenticatedUserId } from "./service-factory";
import { NomenclatureCoverError, processNomenclatureCover } from "../services/nomenclature-cover.service";

const BUCKET = "partner-nomenclature-covers";
type CoverMutationResult = { version: number };

export async function updatePartnerNomenclatureCoverAction(
  itemId: string,
  expectedVersion: number,
  formData: FormData,
): Promise<ActionResult<CoverMutationResult>> {
  let uploadedKey: string | null = null;
  let stage = "context_resolution";
  try {
    const userId = await getAuthenticatedUserId();
    const { companyId } = await createEstimateService().getPartnerNomenclatureMutationContext(userId);
    const remove = formData.get("intent") === "remove";
    let cover: Awaited<ReturnType<typeof processNomenclatureCover>> | null = null;
    if (!remove) {
      stage = "image_validation";
      const file = formData.get("cover");
      if (!(file instanceof File)) return invalidInput("Выберите изображение.");
      cover = await processNomenclatureCover(file);
      uploadedKey = `partner/${companyId}/${itemId}/${randomUUID()}.webp`;
      stage = "storage_upload";
      const { error } = await createAdminClient().storage.from(BUCKET).upload(uploadedKey, cover.bytes, { contentType: "image/webp", upsert: false });
      if (error) throw error;
    }
    stage = "governed_persistence";
    const { data, error } = await (await createClient()).rpc("set_partner_external_nomenclature_cover", {
      target_company_id: companyId,
      target_external_nomenclature_id: itemId,
      expected_version: expectedVersion,
      target_storage_key: uploadedKey,
      target_size_bytes: cover?.bytes.byteLength ?? null,
      target_width: cover?.width ?? null,
      target_height: cover?.height ?? null,
    });
    if (error || !data) throw error ?? new Error("NOMENCLATURE_COVER_PERSISTENCE");
    const result = data as { version: number; previous_storage_key?: string | null };
    if (result.previous_storage_key && result.previous_storage_key !== uploadedKey) {
      await createAdminClient().storage.from(BUCKET).remove([result.previous_storage_key]);
    }
    revalidatePath("/cabinet/nomenclature");
    return success(remove ? "Фото удалено." : "Фото оптимизировано и сохранено.", { version: Number(result.version) });
  } catch (error) {
    if (uploadedKey) await createAdminClient().storage.from(BUCKET).remove([uploadedKey]);
    logCoverFailure("partner", stage, error);
    return coverFailure(error);
  }
}
export async function updateAdminNomenclatureCoverAction(
  itemId: string,
  expectedVersion: number,
  formData: FormData,
): Promise<ActionResult<CoverMutationResult>> {
  let uploadedKey: string | null = null;
  let stage = "permission_check";
  try {
    await requireAdminPermission("admin.external_nomenclature.manage");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 10) return invalidInput("Укажите причину изменения (не менее 10 символов).");
    const remove = formData.get("intent") === "remove";
    let cover: Awaited<ReturnType<typeof processNomenclatureCover>> | null = null;
    if (!remove) {
      stage = "image_validation";
      const file = formData.get("cover");
      if (!(file instanceof File)) return invalidInput("Выберите изображение.");
      cover = await processNomenclatureCover(file);
      uploadedKey = `canonical/${itemId}/${randomUUID()}.webp`;
      stage = "storage_upload";
      const { error } = await createAdminClient().storage.from(BUCKET).upload(uploadedKey, cover.bytes, { contentType: "image/webp", upsert: false });
      if (error) throw error;
    }
    stage = "governed_persistence";
    const { data, error } = await (await createClient()).rpc("set_admin_external_nomenclature_cover", {
      target_external_nomenclature_id: itemId,
      expected_version: expectedVersion,
      target_storage_key: uploadedKey,
      target_size_bytes: cover?.bytes.byteLength ?? null,
      target_width: cover?.width ?? null,
      target_height: cover?.height ?? null,
      change_reason: reason,
    });
    if (error || !data) throw error ?? new Error("NOMENCLATURE_CANONICAL_COVER_PERSISTENCE");
    const result = data as { version: number; previous_storage_key?: string | null };
    if (result.previous_storage_key && result.previous_storage_key !== uploadedKey) await createAdminClient().storage.from(BUCKET).remove([result.previous_storage_key]);
    revalidatePath("/admin/commercial/nomenclature");
    revalidatePath(`/admin/commercial/nomenclature/${itemId}`);
    return success(remove ? "Каноническая обложка удалена." : "Каноническая обложка сохранена.", { version: Number(result.version) });
  } catch (error) {
    if (uploadedKey) await createAdminClient().storage.from(BUCKET).remove([uploadedKey]);
    logCoverFailure("admin", stage, error);
    return coverFailure(error);
  }
}

function logCoverFailure(actor: "partner" | "admin", stage: string, error: unknown) {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
  console.error({
    event: "nomenclature_cover_mutation_failed",
    actor,
    stage,
    errorName: error instanceof Error ? error.name : null,
    errorCode: typeof candidate?.code === "string" ? candidate.code : null,
    httpStatus: typeof candidate?.statusCode === "string" || typeof candidate?.statusCode === "number" ? candidate.statusCode : null,
    safeMessage: error instanceof Error ? error.message : typeof candidate?.message === "string" ? candidate.message : "Unknown cover mutation failure",
  });
}

function coverFailure(error: unknown): ActionResult<CoverMutationResult> {
  if (error instanceof NomenclatureCoverError) {
    if (error.reason === "size") return invalidInput("Размер файла не должен превышать 2 МБ.");
    if (error.reason === "output") return invalidInput("Изображение слишком сложное для безопасной обложки.");
    return invalidInput("Используйте корректное JPG, PNG или WebP изображение.");
  }
  return failureFromError(error);
}
