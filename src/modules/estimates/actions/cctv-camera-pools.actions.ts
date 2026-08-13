"use server";

import { revalidatePath } from "next/cache";
import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { CCTV_OBJECT_TYPES, type CctvCameraPlacement, type CctvCameraPriority } from "../../cctv-calculation";
import { SupabaseCctvCameraCandidateRepository } from "../../cctv-calculation/cctv-camera-candidate.repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listCctvCameraPoolsAction() {
  try { await requireAdminPermission("admin.estimates.view"); return success("Пулы камер загружены.", await new SupabaseCctvCameraCandidateRepository().listAdmin()); }
  catch (error) { return failureFromError(error); }
}

export async function searchCctvCameraCandidatesAction(input: {
  query: string; objectType: string; placement: CctvCameraPlacement;
}) {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 100 || !CCTV_OBJECT_TYPES.includes(input.objectType as never)
    || !["indoor", "outdoor"].includes(input.placement)) return invalidInput("Введите минимум два символа.");
  try {
    await requireAdminPermission("admin.estimates.view");
    return success("Кандидаты камер найдены.", await new SupabaseCctvCameraCandidateRepository().searchAdmin({
      query, objectType: input.objectType as typeof CCTV_OBJECT_TYPES[number], placement: input.placement,
    }));
  } catch (error) { return failureFromError(error); }
}

export async function upsertCctvCameraPoolAction(input: { objectType: string; placement: CctvCameraPlacement;
  productId: string; manualPriority: CctvCameraPriority; enabled: boolean; notes: string; expectedVersion: number | null }) {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType as never) || !["indoor","outdoor"].includes(input.placement)
    || !["high","normal","low"].includes(input.manualPriority) || !UUID.test(input.productId)
    || input.notes.length > 1000 || (input.expectedVersion !== null && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1))) {
    return invalidInput("Настройка пула некорректна.");
  }
  try {
    await requireAdminPermission("admin.integrations.manage");
    const repository = new SupabaseCctvCameraCandidateRepository();
    const result = await repository.upsertAdmin({ ...input, objectType: input.objectType as typeof CCTV_OBJECT_TYPES[number] });
    const saved = (await repository.listAdmin()).find((row) => row.candidateId === result.candidateId);
    if (!saved) throw new Error("Saved CCTV camera candidate is unavailable.");
    revalidatePath("/admin/commercial/proposal-generator");
    return success("Кандидат камеры сохранён.", saved);
  } catch (error) { return failureFromError(error); }
}
