"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/src/modules/admin/services";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";

import { getInstallationAssignmentDispatcher, getRetailMarketplaceRepository } from "./server";

const path = "/admin/retail/installation";

export async function saveInstallationTariffDraftAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const tariffSetId = nullable(String(formData.get("tariffSetId") ?? ""));
  const lines = [
    ["camera_installation", "piece"],
    ["cable_laying", "meter"],
    ["commissioning", "piece"],
    ["remote_configuration", "service"],
  ].flatMap(([serviceType, unitCode]) => {
    const raw = String(formData.get(serviceType) ?? "").trim();
    return raw === "" ? [] : [{ serviceType, unitCode, unitPrice: Number(raw) }];
  });
  await getRetailMarketplaceRepository().saveTariffDraft({
    tariffSetId,
    effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
    currency: "MDL",
    vatTreatment: String(formData.get("vatTreatment") ?? "not_specified"),
    lines,
    expectedRevision: Number(formData.get("revision") ?? 0),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=tariff`);
}

export async function publishInstallationTariffAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getRetailMarketplaceRepository().publishTariff({
    tariffSetId: String(formData.get("tariffSetId") ?? ""),
    expectedRevision: Number(formData.get("revision") ?? 0),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=published`);
}

export async function saveInstallationProviderAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  const providerType = String(formData.get("providerType")) as "partner_company" | "internal_team";
  await getRetailMarketplaceRepository().saveProvider({
    providerId: nullable(String(formData.get("providerId") ?? "")),
    providerType,
    backingId: String(formData.get("backingId") ?? ""),
    profile: {
      operationalStatus: String(formData.get("operationalStatus") ?? "inactive"),
      approvalStatus: String(formData.get("approvalStatus") ?? "pending"),
      marketplaceEnabled: formData.get("marketplaceEnabled") === "on",
      publicNameRu: String(formData.get("publicNameRu") ?? ""),
      publicNameRo: String(formData.get("publicNameRo") ?? ""),
      publicDescriptionRu: String(formData.get("publicDescriptionRu") ?? ""),
      publicDescriptionRo: String(formData.get("publicDescriptionRo") ?? ""),
      publicProfileStatus: String(formData.get("publicProfileStatus") ?? "draft"),
      availability: String(formData.get("availability") ?? "unavailable"),
      maxConcurrentJobs: String(formData.get("maxConcurrentJobs") ?? ""),
      acceptanceSlaMinutes: Number(formData.get("acceptanceSlaMinutes") ?? 120),
    },
    competencies: formData.get("cctv") === "on" ? ["cctv"] : [],
    regionCodes: formData.getAll("regions").map(String),
    expectedRevision: Number(formData.get("revision") ?? 0),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=provider`);
}

function nullable(value: string) { return value.trim() || null; }

export async function respondInstallationOfferAction(formData: FormData) {
  const context = await getPartnerWorkspaceContextAction();
  if (!context.success || !context.data.companyId || context.data.accessState !== "active") redirect("/cabinet");
  const decision = String(formData.get("decision")) as "accept" | "decline";
  await getInstallationAssignmentDispatcher().respond({
    companyId: context.data.companyId,
    attemptId: String(formData.get("attemptId") ?? ""),
    decision,
    reasonCode: nullable(String(formData.get("reasonCode") ?? "")),
    reasonText: nullable(String(formData.get("reasonText") ?? "")),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });
  revalidatePath("/cabinet/installation-orders");
  redirect(`/cabinet/installation-orders?result=${decision}`);
}

export async function transitionPartnerInstallationExecutionAction(formData: FormData) {
  const context = await getPartnerWorkspaceContextAction();
  if (!context.success || !context.data.companyId || context.data.accessState !== "active") redirect("/cabinet");
  await getInstallationAssignmentDispatcher().transitionPartner({
    companyId: context.data.companyId,
    executionId: String(formData.get("executionId") ?? ""),
    command: String(formData.get("command") ?? "") as "schedule" | "start" | "complete",
    expectedRevision: Number(formData.get("revision") ?? -1),
    scheduledStartAt: nullable(String(formData.get("scheduledStartAt") ?? "")),
    scheduledEndAt: nullable(String(formData.get("scheduledEndAt") ?? "")),
    note: nullable(String(formData.get("note") ?? "")),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });
  revalidatePath("/cabinet/installation-orders");
  redirect("/cabinet/installation-orders?view=active&result=updated");
}

export async function transitionAdminInstallationExecutionAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationAssignmentDispatcher().transitionAdmin({
    executionId: String(formData.get("executionId") ?? ""),
    command: String(formData.get("command") ?? "") as "schedule" | "start" | "complete" | "open_dispute" | "resolve_dispute" | "cancel",
    expectedRevision: Number(formData.get("revision") ?? -1),
    scheduledStartAt: nullable(String(formData.get("scheduledStartAt") ?? "")),
    scheduledEndAt: nullable(String(formData.get("scheduledEndAt") ?? "")),
    note: nullable(String(formData.get("note") ?? "")),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=execution`);
}

export async function activateInstallationPilotAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationAssignmentDispatcher().activatePilot({
    retailOrderId: String(formData.get("retailOrderId") ?? ""),
    selectionMode: String(formData.get("selectionMode") ?? "automatic") as "automatic" | "customer_selected",
    preferredProviderId: nullable(String(formData.get("preferredProviderId") ?? "")),
    regionCode: String(formData.get("regionCode") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=activation`);
}

export async function reassignInstallationRequirementAction(formData: FormData) {
  await requireAdminPermission("admin.retail_marketplace.manage");
  await getInstallationAssignmentDispatcher().reassign({
    requirementId: String(formData.get("requirementId") ?? ""),
    providerId: String(formData.get("providerId") ?? ""),
    expectedRevision: Number(formData.get("revision") ?? -1),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(path);
  redirect(`${path}?saved=reassigned`);
}
