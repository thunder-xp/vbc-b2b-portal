"use server";

import { revalidatePath } from "next/cache";
import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { DomainConflictError } from "../../access-control/services";
import { requireAdminPermission } from "../../admin/services";
import { CCTV_OBJECT_TYPES, type CctvCameraPlacement, type CctvCameraPriority } from "../../cctv-calculation";
import { SupabaseCctvCameraCandidateRepository } from "../../cctv-calculation/cctv-camera-candidate.repository";
import { SupabaseCctvObjectConfigurationRepository } from "../../cctv-calculation/cctv-object-configuration.repository";
import type { CctvServiceCode } from "../../cctv-calculation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cctvConfigurationFailure(error: unknown) {
  if (error instanceof Error && ["CCTV_CAMERA_POOL_CONFLICT", "CCTV_SERVICE_BINDING_CONFLICT", "CCTV_TARIFF_CONFLICT"].includes(error.message)) {
    return failureFromError(new DomainConflictError(error.message, "Настройка изменилась. Обновите страницу и повторите действие."));
  }
  return failureFromError(error);
}

export async function listCctvCameraPoolsAction() {
  try { await requireAdminPermission("admin.estimates.view"); return success("Пулы камер загружены.", await new SupabaseCctvCameraCandidateRepository().listAdmin()); }
  catch (error) { return failureFromError(error); }
}

export async function listCctvObjectConfigurationsAction() {
  try { await requireAdminPermission("admin.estimates.view"); return success("Настройки объектов загружены.", await new SupabaseCctvObjectConfigurationRepository().listAdmin()); }
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
  } catch (error) { return cctvConfigurationFailure(error); }
}

export async function removeCctvCameraPoolAction(input: { candidateId: string; expectedVersion: number }) {
  if (!UUID.test(input.candidateId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) return invalidInput("Кандидат камеры некорректен.");
  try {
    await requireAdminPermission("admin.integrations.manage");
    await new SupabaseCctvCameraCandidateRepository().removeAdmin(input.candidateId, input.expectedVersion);
    revalidatePath("/admin/commercial/proposal-generator");
    return success("Кандидат удалён из пула.", input.candidateId);
  } catch (error) { return cctvConfigurationFailure(error); }
}

export async function upsertCctvObjectServiceBindingAction(input: { objectType: string; serviceCode: CctvServiceCode;
  enabled: boolean; calculatorDefault: boolean; displayOrder: number; notes: string; expectedVersion: number }) {
  if (!CCTV_OBJECT_TYPES.includes(input.objectType as never) || !Number.isInteger(input.displayOrder)
    || input.displayOrder < 1 || input.displayOrder > 100 || input.notes.length > 1000
    || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || (input.calculatorDefault && !input.enabled)) {
    return invalidInput("Настройка услуги некорректна.");
  }
  try {
    await requireAdminPermission("admin.integrations.manage");
    const repository = new SupabaseCctvObjectConfigurationRepository();
    await repository.upsert({ ...input, objectType: input.objectType as typeof CCTV_OBJECT_TYPES[number] });
    const saved = (await repository.getAdmin(input.objectType as typeof CCTV_OBJECT_TYPES[number])).services
      .find((service) => service.serviceCode === input.serviceCode);
    if (!saved) throw new Error("Saved CCTV service binding is unavailable.");
    revalidatePath("/admin/commercial/proposal-generator");
    return success("Настройка услуги сохранена.", saved);
  } catch (error) { return cctvConfigurationFailure(error); }
}

export async function saveCctvServiceConfigurationAction(input: { objectType: string; serviceCode: CctvServiceCode;
  unitPrice: string; enabled: boolean; calculatorDefault: boolean; displayOrder: number; notes: string;
  expectedBindingVersion: number; expectedTariffSetId: string; expectedTariffVersion: number }) {
  const price = input.unitPrice.trim();
  if (!CCTV_OBJECT_TYPES.includes(input.objectType as never) || !UUID.test(input.expectedTariffSetId)
    || !Number.isInteger(input.displayOrder) || input.displayOrder < 1 || input.displayOrder > 100
    || input.notes.length > 1000 || !Number.isInteger(input.expectedBindingVersion) || input.expectedBindingVersion < 1
    || !Number.isInteger(input.expectedTariffVersion) || input.expectedTariffVersion < 1
    || (price !== "" && !/^\d{1,12}(?:\.\d{1,2})?$/.test(price))
    || (price !== "" && Number(price) <= 0) || (input.calculatorDefault && !input.enabled)) {
    return invalidInput("Проверьте тариф и состояние услуги.");
  }
  try {
    await requireAdminPermission("admin.retail_marketplace.manage");
    await requireAdminPermission("admin.integrations.manage");
    const configurations = await new SupabaseCctvObjectConfigurationRepository().saveAdminConfiguration({
      ...input, objectType: input.objectType as typeof CCTV_OBJECT_TYPES[number], unitPrice: price === "" ? null : Number(price),
      reason: "Admin CCTV service row update",
    });
    return success("Настройка и общий тариф сохранены.", configurations);
  } catch (error) { return cctvConfigurationFailure(error); }
}
