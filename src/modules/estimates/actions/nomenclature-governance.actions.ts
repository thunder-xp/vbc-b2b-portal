"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { failureFromError, invalidInput, success } from "@/src/modules/access-control/actions/action-result";
import { SupabaseNomenclatureGovernanceRepository } from "../repositories/supabase";
import type { ExternalNomenclatureItemType, NomenclatureCurationStatus } from "../repositories";
import { NomenclatureGovernanceService } from "../services";

const service = () => new NomenclatureGovernanceService(new SupabaseNomenclatureGovernanceRepository());

export async function listAdminNomenclatureAction(filters: { search?: string; itemType?: ExternalNomenclatureItemType; status?: NomenclatureCurationStatus; category?: string; manufacturer?: string; page?: number }) {
  await requireAdminPermission("admin.external_nomenclature.view");
  return service().list(filters);
}
export async function getAdminNomenclatureDetailAction(itemId: string) {
  await requireAdminPermission("admin.external_nomenclature.view");
  return service().getDetail(itemId);
}
export async function updateAdminNomenclatureAction(input: Parameters<NomenclatureGovernanceService["update"]>[0]) {
  try { await requireAdminPermission("admin.external_nomenclature.manage"); const version = await service().update(input); revalidatePath("/admin/commercial/nomenclature"); revalidatePath(`/admin/commercial/nomenclature/${input.itemId}`); return success("Канонические данные сохранены.", { version }); }
  catch (error) { if (error instanceof Error && error.message.startsWith("INVALID_")) return invalidInput("Проверьте данные и укажите причину изменения."); return failureFromError(error); }
}
export async function markAdminNomenclatureDuplicateAction(sourceItemId: string, canonicalItemId: string, reason: string) {
  try { await requireAdminPermission("admin.external_nomenclature.manage"); const id = await service().markDuplicate(sourceItemId, canonicalItemId, reason); revalidatePath("/admin/commercial/nomenclature"); return success("Дубликат перенаправлен на каноническую позицию. Исторические ссылки сохранены.", { id }); }
  catch (error) { if (error instanceof Error && error.message.startsWith("INVALID_")) return invalidInput("Укажите каноническую позицию и причину изменения."); return failureFromError(error); }
}
