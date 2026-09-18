"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { getInstallationMarketplaceService } from "./server";
import { InstallationMarketplaceInputError } from "./service";
import { InstallationMarketplaceRepositoryError } from "./supabase.repository";
import { persistInstallationMarketplaceInvitationEmail } from "./marketplace-invitation.communication";

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
  revalidatePath("/cabinet/installation-marketplace");
  redirect("/cabinet/installation-marketplace?view=new&result=updated");
}

export async function transitionMarketplaceInstallationAction(formData: FormData) {
  const context=await getPartnerWorkspaceContextAction();
  if(!context.success||!context.data.companyId||context.data.accessState!=="active") redirect("/cabinet");
  await getInstallationMarketplaceService().transitionPartner({ companyId:context.data.companyId, assignmentId:text(formData,"assignmentId"), command:text(formData,"command") as "CONTACTED"|"SCHEDULED"|"INSTALLED", plannedFor:nullable(formData,"plannedFor"), expectedRevision:Number(text(formData,"revision")), idempotencyKey:text(formData,"idempotencyKey") });
  revalidatePath("/cabinet/installation-marketplace");
  redirect("/cabinet/installation-marketplace?view=active&result=updated");
}

export async function moderateInstallationReviewAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationMarketplaceService().moderate({ reviewId:text(formData,"reviewId"), status:text(formData,"status") as "PUBLISHED"|"PENDING_REVIEW"|"HIDDEN", expectedRevision:Number(text(formData,"revision")), reason:text(formData,"reason"), correlationId:text(formData,"correlationId")||randomUUID() });
  revalidatePath("/admin/retail/installation"); revalidatePath("/partners");
  redirect("/admin/retail/installation?marketplace=moderated");
}

async function requirePartnerCompany() {
  const context=await getPartnerWorkspaceContextAction();
  if(!context.success||!context.data.companyId||context.data.accessState!=="active") redirect("/cabinet");
  return context.data.companyId;
}

export async function optInInstallationMarketplaceAction() {
  const companyId=await requirePartnerCompany();
  await getInstallationMarketplaceService().optInPartner(companyId);
  revalidatePath("/cabinet/installation-marketplace");
  redirect("/cabinet/installation-marketplace?result=enrolled");
}

export type PartnerActivationSaveActionState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  revision: number;
};

export async function saveInstallationMarketplaceActivationAction(
  previousState: PartnerActivationSaveActionState,
  formData: FormData,
): Promise<PartnerActivationSaveActionState> {
  const companyId=await requirePartnerCompany();
  const capacity=text(formData,"maxConcurrentJobs").trim();
  const locale=text(formData,"locale")==="ro"?"ro":"ru";
  try {
    const result=await getInstallationMarketplaceService().savePartnerActivation({
      companyId, descriptionRu:nullable(formData,"descriptionRu"), descriptionRo:nullable(formData,"descriptionRo"),
      availability:text(formData,"availability"), maxConcurrentJobs:capacity?Number(capacity):null,
      capabilities:formData.getAll("capabilities").map(String), regionCodes:formData.getAll("regions").map(String),
      acceptTerms:formData.get("acceptTerms")==="on", acceptPrivacy:formData.get("acceptPrivacy")==="on",
      expectedRevision:Number(text(formData,"revision")),
    });
    revalidatePath("/cabinet/installation-marketplace");
    return {
      status:"success",
      message:locale==="ro"?"Modificările au fost salvate.":"Изменения сохранены.",
      revision:result.revision,
    };
  } catch(error) {
    if(error instanceof InstallationMarketplaceRepositoryError) {
      if(error.code==="conflict") return {
        status:"conflict",
        message:locale==="ro"?"Datele au fost modificate într-o altă sesiune. Reîncărcați pagina și verificați modificările.":"Данные были изменены в другой сессии. Обновите страницу и проверьте изменения.",
        revision:previousState.revision,
      };
      if(error.code==="forbidden") return {
        status:"error",
        message:locale==="ro"?"Nu aveți acces pentru a salva acest profil.":"Недостаточно прав для сохранения профиля.",
        revision:previousState.revision,
      };
    }
    return {
      status:"error",
      message:error instanceof InstallationMarketplaceInputError
        ? locale==="ro"?"Verificați datele introduse și încercați din nou.":"Проверьте введённые данные и повторите попытку."
        : locale==="ro"?"Modificările nu au putut fi salvate. Încercați din nou.":"Не удалось сохранить изменения. Попробуйте ещё раз.",
      revision:previousState.revision,
    };
  }
}

export async function submitInstallationMarketplaceActivationAction(formData: FormData) {
  const companyId=await requirePartnerCompany();
  await getInstallationMarketplaceService().submitPartnerActivation(companyId,Number(text(formData,"revision")));
  revalidatePath("/cabinet/installation-marketplace");
  redirect("/cabinet/installation-marketplace?result=submitted");
}

export async function reviewInstallationMarketplaceActivationAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationMarketplaceService().reviewPartnerActivation({
    providerId:text(formData,"providerId"), action:text(formData,"command") as "APPROVE"|"REJECT"|"SUSPEND"|"REACTIVATE",
    rejectionReason:nullable(formData,"rejectionReason"), note:nullable(formData,"note"), expectedRevision:Number(text(formData,"revision")),
  });
  revalidatePath("/admin/retail/installation");
  redirect("/admin/retail/installation?section=supply&activation=updated");
}

export async function returnInstallationMarketplaceForCorrectionAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationMarketplaceService().returnPartnerForCorrection({
    providerId:text(formData,"providerId"), reasonRu:text(formData,"reasonRu"),
    reasonRo:text(formData,"reasonRo"), expectedRevision:Number(text(formData,"revision")),
  });
  revalidatePath("/admin/retail/installation");
  revalidatePath("/cabinet/installation-marketplace");
  redirect("/admin/retail/installation?activation=correction-requested");
}

export async function saveInstallationMarketplacePilotConfigurationAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationMarketplaceService().savePilotConfiguration({
    regionCode:text(formData,"regionCode"), capability:text(formData,"capability"),
    enabled:formData.get("enabled")==="on", threshold:Number(text(formData,"threshold")),
    expectedRevision:Number(text(formData,"revision")), correlationId:text(formData,"correlationId")||randomUUID(),
  });
  revalidatePath("/admin/retail/installation");
  redirect("/admin/retail/installation?section=supply&pilot=saved");
}

export async function prepareInstallationMarketplaceInvitationAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const expires=text(formData,"expiresAt").trim();
  await getInstallationMarketplaceService().prepareInvitation({
    companyId:text(formData,"companyId"), locale:text(formData,"locale"),
    channels:["IN_APP",...(formData.get("email")==="on"?["EMAIL"]:[])],
    expiresAt:expires?new Date(expires).toISOString():null,
    expectedRevision:Number(text(formData,"revision")), readyToSend:text(formData,"command")==="READY_TO_SEND",
    correlationId:text(formData,"correlationId")||randomUUID(),
  });
  revalidatePath("/admin/retail/installation");
  redirect(`/admin/retail/installation?section=supply&invitation=${text(formData,"command")==="READY_TO_SEND"?"prepared":"draft"}`);
}

export async function sendInstallationMarketplaceInvitationAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const correlationId=text(formData,"correlationId")||randomUUID();
  const invitation=await getInstallationMarketplaceService().sendInvitation({
    invitationId:text(formData,"invitationId"), expectedRevision:Number(text(formData,"revision")), correlationId,
  });
  let result="sent";
  try {
    await persistInstallationMarketplaceInvitationEmail(invitation,correlationId);
  } catch {
    result="in_app_only";
  }
  revalidatePath("/admin/retail/installation");
  revalidatePath("/cabinet/installation-marketplace");
  redirect(`/admin/retail/installation?section=supply&invitation=${result}`);
}
