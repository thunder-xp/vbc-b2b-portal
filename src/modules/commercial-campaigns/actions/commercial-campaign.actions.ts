"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { requireAdminPermission, requireAnyAdminPermission } from "../../admin/services";
import type { CampaignCompanySearch, CampaignDraftInput, CampaignDraftUpdateInput, CampaignFilter, CampaignProductSearch, PartnerCampaign, PartnerCampaignPage } from "../types";
import type { CampaignActionResult } from "./result";
import { campaignFailure, campaignSuccess } from "./result";
import { createCommercialCampaignService } from "./service-factory";

export async function listPartnerCampaignsAction(input: { filter?: CampaignFilter; page?: number; pageSize?: number } = {}): Promise<CampaignActionResult<PartnerCampaignPage & { page: number; totalPages: number }>> {
  try {
    return campaignSuccess(await createCommercialCampaignService().listPartner(await getAuthenticatedUserId(), input), "Предложения загружены.");
  } catch (error) {
    return fail(error, "Не удалось загрузить предложения. Обновите страницу позже.", "campaign_list_failed");
  }
}

export async function getPartnerCampaignAction(campaignId: string): Promise<CampaignActionResult<PartnerCampaign>> {
  try {
    const campaign = await createCommercialCampaignService().getPartner(await getAuthenticatedUserId(), campaignId);
    return campaign ? campaignSuccess(campaign, "Предложение загружено.") : campaignFailure("Предложение недоступно.", crypto.randomUUID());
  } catch (error) {
    return fail(error, "Предложение недоступно.", "campaign_detail_failed");
  }
}

export async function addCampaignItemToCartAction(input: { campaignItemId: string; quantity: number; requestId: string }): Promise<CampaignActionResult<{ cartItemId: string; quantity: number }>> {
  try {
    const data = await createCommercialCampaignService().addToCart(await getAuthenticatedUserId(), input.campaignItemId, input.quantity, input.requestId);
    revalidatePath("/cabinet/cart");
    return campaignSuccess(data, `Добавлено в корзину: ${data.quantity} шт.`);
  } catch (error) {
    return fail(error, "Не удалось добавить товар. Проверьте количество и условия предложения.", "campaign_cart_failed");
  }
}

export async function recordCampaignEngagementAction(input: { campaignId: string; campaignItemId?: string; eventType: "impression" | "detail_opened" | "product_opened"; requestId: string }) {
  try {
    await createCommercialCampaignService().recordEngagement(await getAuthenticatedUserId(), input);
  } catch { /* Measurement never blocks the partner flow. */ }
}

export async function createCampaignDraftAction(input: CampaignDraftInput): Promise<CampaignActionResult<{ id: string }>> {
  await requireAdminPermission("campaigns.create");
  try {
    const id = await createCommercialCampaignService().createDraft(input);
    revalidatePath("/admin/commercial/campaigns");
    return campaignSuccess({ id }, "Черновик кампании создан.");
  } catch (error) {
    return fail(error, "Не удалось создать кампанию. Проверьте обязательные поля.", "campaign_create_failed");
  }
}

export async function updateCampaignDraftAction(input: CampaignDraftUpdateInput): Promise<CampaignActionResult<{ revision: number }>> {
  await requireAdminPermission("campaigns.edit");
  try {
    const data = await createCommercialCampaignService().updateDraft(input);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${input.campaignId}`);
    return campaignSuccess(data, "Изменения сохранены.");
  } catch (error) {
    const conflict = error instanceof Error && /CAMPAIGN_DRAFT_CONFLICT/i.test(error.message);
    return fail(error, conflict ? "Черновик уже изменён другим администратором. Обновите страницу перед повторным сохранением." : "Не удалось сохранить черновик. Проверьте отмеченные поля.", conflict ? "campaign_update_conflict" : "campaign_update_failed");
  }
}

export async function searchCampaignProductsAction(input: { search?: string; categoryId?: string; brandId?: string; inStockOnly?: boolean; page?: number }): Promise<CampaignActionResult<CampaignProductSearch>> {
  await requireAnyAdminPermission(["campaigns.create", "campaigns.edit"]);
  try { return campaignSuccess(await createCommercialCampaignService().searchProducts(input), "Товары загружены."); }
  catch (error) { return fail(error, "Не удалось загрузить товары.", "campaign_product_search_failed"); }
}

export async function searchCampaignCompaniesAction(search = "", offset = 0): Promise<CampaignActionResult<CampaignCompanySearch>> {
  await requireAnyAdminPermission(["campaigns.create", "campaigns.edit"]);
  try { return campaignSuccess(await createCommercialCampaignService().searchCompanies(search, offset), "Компании загружены."); }
  catch (error) { return fail(error, "Не удалось загрузить компании.", "campaign_company_search_failed"); }
}

export async function duplicateCampaignAction(campaignId: string, requestId: string): Promise<CampaignActionResult<{ id: string }>> {
  await requireAdminPermission("campaigns.create");
  try { const id = await createCommercialCampaignService().duplicate(campaignId, requestId); revalidatePath("/admin/commercial/campaigns"); return campaignSuccess({ id }, "Копия создана как новый черновик."); }
  catch (error) { return fail(error, "Не удалось создать копию.", "campaign_duplicate_failed"); }
}

export async function archiveCampaignAction(campaignId: string, reason: string): Promise<CampaignActionResult<boolean>> {
  await requireAdminPermission("campaigns.edit");
  try { await createCommercialCampaignService().archive(campaignId, reason); revalidatePath("/admin/commercial/campaigns"); revalidatePath(`/admin/commercial/campaigns/${campaignId}`); return campaignSuccess(true, "Предложение перемещено в архив."); }
  catch (error) { return fail(error, "Не удалось архивировать предложение.", "campaign_archive_failed"); }
}

export async function resumeCampaignAction(campaignId: string, reason: string): Promise<CampaignActionResult<boolean>> {
  await requireAdminPermission("campaigns.pause");
  try { await createCommercialCampaignService().resume(campaignId, reason); revalidatePath("/admin/commercial/campaigns"); revalidatePath(`/admin/commercial/campaigns/${campaignId}`); return campaignSuccess(true, "Показ предложения возобновлён."); }
  catch (error) { return fail(error, "Не удалось возобновить предложение.", "campaign_resume_failed"); }
}

export async function reopenCampaignForEditAction(campaignId: string, reason: string): Promise<CampaignActionResult<{ revision: number }>> {
  await requireAdminPermission("campaigns.edit");
  try {
    const data = await createCommercialCampaignService().reopenForEdit(campaignId, reason);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(data, "Предложение остановлено и открыто для редактирования.");
  } catch (error) {
    return fail(error, "Не удалось открыть предложение для редактирования.", "campaign_reopen_failed");
  }
}

export async function deleteArchivedCampaignAction(campaignId: string, reason: string): Promise<CampaignActionResult<boolean>> {
  await requireAdminPermission("campaigns.edit");
  try {
    await createCommercialCampaignService().deleteArchived(campaignId, reason);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(true, "Архивное предложение удалено из рабочего списка.");
  } catch (error) {
    return fail(error, "Удалить можно только архивное предложение.", "campaign_delete_archived_failed");
  }
}

export async function publishCampaignAction(campaignId: string, requestId: string): Promise<CampaignActionResult<{ status: string; version: number; audienceCount: number }>> {
  await requireAdminPermission("campaigns.publish");
  try {
    const data = await createCommercialCampaignService().publish(campaignId, requestId);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(data, "Кампания опубликована.");
  } catch (error) {
    return fail(error, "Публикация отклонена: проверьте период, товары и аудиторию.", "campaign_publish_failed");
  }
}

export async function pauseCampaignAction(campaignId: string, reason: string): Promise<CampaignActionResult<boolean>> {
  await requireAdminPermission("campaigns.pause");
  try {
    await createCommercialCampaignService().pause(campaignId, reason);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(true, "Кампания приостановлена.");
  } catch (error) {
    return fail(error, "Не удалось приостановить кампанию.", "campaign_pause_failed");
  }
}

function fail<T>(error: unknown, message: string, event: string) {
  const correlationId = crypto.randomUUID();
  console.error({ event, correlationId, errorType: error instanceof Error ? error.name : typeof error });
  return campaignFailure<T>(`${message} Код: ${correlationId}.`, correlationId);
}
