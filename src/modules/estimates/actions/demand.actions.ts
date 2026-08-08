"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success } from "@/src/modules/access-control/actions/action-result";

import { SupabaseExternalDemandRepository } from "../repositories/supabase";
import { ExternalDemandService } from "../services";

const service = new ExternalDemandService(new SupabaseExternalDemandRepository());

export async function setExternalDemandAction(estimateId: string, estimateItemId: string, action: "request" | "cancel") {
  try {
    const state = await service.setPartnerRequest(estimateId, estimateItemId, action);
    revalidatePath(`/cabinet/estimates/${estimateId}`);
    return success(action === "request" ? "Запрос Novotech отправлен." : "Запрос Novotech отменён.", state);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function transitionExternalDemandAction(input: { externalItemId: string; requestId: string; expectedVersion: number; status: string; responseType?: string; catalogProductId?: string }) {
  try {
    const state = await service.transition(input);
    revalidatePath(`/admin/commercial/unmet-demand/${input.externalItemId}`);
    revalidatePath("/admin/commercial/unmet-demand");
    return success("Статус запроса обновлён.", state);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function curateExternalNomenclatureAction(input: { sourceItemId: string; canonicalItemId: string; reason: string }) {
  try {
    const canonicalId = await service.curate(input.sourceItemId, input.canonicalItemId, input.reason);
    revalidatePath("/admin/commercial/unmet-demand");
    return success("Дубликат связан с канонической позицией.", canonicalId);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listExternalDemandForAdmin(input: { search?: string; status?: string; page?: number }) {
  return service.listAdmin(input);
}

export async function getExternalDemandForAdmin(externalItemId: string) {
  return service.getAdminDetail(externalItemId);
}

export async function searchExternalDemandProductsForAdmin(query: string) {
  return service.searchAdminProducts(query);
}
