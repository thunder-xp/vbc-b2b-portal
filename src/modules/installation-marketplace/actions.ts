"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getInstallationMarketplaceService } from "./server";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const nullable = (formData: FormData, key: string) => text(formData,key).trim() || null;

export async function createInstallationProjectAction(formData: FormData) {
  await getFinalCustomerContext();
  const result = await getInstallationMarketplaceService().create({
    sourceType: text(formData,"sourceType") || "CUSTOM",
    sourceOrderId: nullable(formData,"sourceOrderId"),
    sourcePublicProductId: nullable(formData,"sourcePublicProductId"),
    objectType: text(formData,"objectType"), locality: text(formData,"locality"),
    regionCode: nullable(formData,"regionCode"), needType: text(formData,"needType"),
    description: nullable(formData,"description"), contactConsent: formData.get("contactConsent") === "on",
    creationKey: text(formData,"creationKey"),
  });
  revalidatePath("/account/installations");
  redirect(`/account/installations/${result.projectId}`);
}
export async function selectInstallationPartnerAction(formData: FormData) {
  await getFinalCustomerContext();
  const projectId=text(formData,"projectId");
  await getInstallationMarketplaceService().select({ projectId, providerId:text(formData,"providerId"), expectedRevision:Number(text(formData,"revision")), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/account/installations"); revalidatePath(`/account/installations/${projectId}`);
  redirect(`/account/installations/${projectId}?saved=partner`);
}

export async function transitionCustomerInstallationAction(formData: FormData) {
  await getFinalCustomerContext();
  const projectId=text(formData,"projectId");
  await getInstallationMarketplaceService().transitionCustomer({ projectId, command:text(formData,"command") as "CONFIRM"|"DISPUTE"|"CANCEL", expectedRevision:Number(text(formData,"revision")), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/account/installations"); revalidatePath(`/account/installations/${projectId}`);
  redirect(`/account/installations/${projectId}?saved=status`);
}

export async function submitInstallationReviewAction(formData: FormData) {
  await getFinalCustomerContext();
  const projectId=text(formData,"projectId");
  await getInstallationMarketplaceService().review({ projectId, overall:Number(text(formData,"overall")), workmanship:Number(text(formData,"workmanship")), communication:Number(text(formData,"communication")), agreement:Number(text(formData,"agreement")), comment:nullable(formData,"comment"), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/account/installations"); revalidatePath(`/account/installations/${projectId}`); revalidatePath("/partners");
  redirect(`/account/installations/${projectId}?saved=review`);
}

export async function respondMarketplaceInstallationAction(formData: FormData) {
  const context=await getPartnerWorkspaceContextAction();
  if(!context.success||!context.data.companyId||context.data.accessState!=="active") redirect("/cabinet");
  await getInstallationMarketplaceService().respondPartner({ companyId:context.data.companyId, assignmentId:text(formData,"assignmentId"), decision:text(formData,"decision") as "ACCEPT"|"DECLINE", reason:nullable(formData,"reason"), reasonNote:nullable(formData,"reasonNote"), expectedRevision:Number(text(formData,"assignmentRevision")), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/cabinet/installation-orders");
  redirect("/cabinet/installation-orders?marketplace=updated");
}

export async function transitionMarketplaceInstallationAction(formData: FormData) {
  const context=await getPartnerWorkspaceContextAction();
  if(!context.success||!context.data.companyId||context.data.accessState!=="active") redirect("/cabinet");
  await getInstallationMarketplaceService().transitionPartner({ companyId:context.data.companyId, assignmentId:text(formData,"assignmentId"), command:text(formData,"command") as "CONTACTED"|"SCHEDULED"|"INSTALLED", plannedFor:nullable(formData,"plannedFor"), expectedRevision:Number(text(formData,"revision")), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/cabinet/installation-orders");
  redirect("/cabinet/installation-orders?view=active&marketplace=updated");
}

export async function moderateInstallationReviewAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationMarketplaceService().moderate({ reviewId:text(formData,"reviewId"), status:text(formData,"status") as "PUBLISHED"|"PENDING_REVIEW"|"HIDDEN", expectedRevision:Number(text(formData,"revision")), reason:text(formData,"reason"), correlationId:text(formData,"correlationId")||randomUUID() });
  revalidatePath("/admin/retail/installation"); revalidatePath("/partners");
  redirect("/admin/retail/installation?marketplace=moderated");
}
