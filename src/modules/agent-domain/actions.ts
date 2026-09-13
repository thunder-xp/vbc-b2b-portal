"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { createAgentDomainService } from "./factory";
import type { AgentCompliance, CommercialAgentStatus } from "./types";

export type ReferralCaptureState = {
  success: boolean;
  message: string;
  referralId?: string;
};

export type ReferralTokenState = {
  success: boolean;
  message: string;
  referralUrl?: string;
};

export async function createCommercialAgentAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  const created = await createAgentDomainService().createAgent({
    actorUserId: context.userId,
    userId: optionalText(formData, "userId"),
    agentType: requiredText(formData, "agentType") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL",
    displayName: requiredText(formData, "displayName"),
    legalName: optionalText(formData, "legalName"),
    idnoIdnp: optionalText(formData, "idnoIdnp"),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    locality: optionalText(formData, "locality"),
    profession: optionalText(formData, "profession"),
    workplace: optionalText(formData, "workplace"),
  });
  revalidatePath("/admin/agents");
  redirect(`/admin/agents/${created.id}`);
}

export async function transitionCommercialAgentAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  const agentId = requiredText(formData, "agentId");
  await createAgentDomainService().transitionAgent(
    agentId,
    requiredText(formData, "targetStatus") as CommercialAgentStatus,
    context.userId,
  );
  revalidatePath(`/admin/agents/${agentId}`);
  revalidatePath("/admin/agents");
}

export async function reviewAgentComplianceAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  const agentId = requiredText(formData, "agentId");
  await createAgentDomainService().reviewCompliance({
    agentId,
    actorUserId: context.userId,
    publicSectorFlag: optionalBoolean(formData, "publicSectorFlag"),
    externalPaidActivityStatus: requiredText(formData, "externalPaidActivityStatus") as AgentCompliance["externalPaidActivityStatus"],
    procurementParticipationFlag: optionalBoolean(formData, "procurementParticipationFlag"),
    conflictOfInterestStatus: requiredText(formData, "conflictOfInterestStatus") as AgentCompliance["conflictOfInterestStatus"],
    reviewStatus: requiredText(formData, "reviewStatus") as AgentCompliance["complianceReviewStatus"],
    safeReviewNote: optionalText(formData, "safeReviewNote"),
  });
  revalidatePath(`/admin/agents/${agentId}`);
}

export async function createReferralTokenAction(
  _previous: ReferralTokenState,
  formData: FormData,
): Promise<ReferralTokenState> {
  try {
    const context = await requireAdminPermission("admin.agents.manage");
    const result = await createAgentDomainService().createReferralToken({
      agentId: requiredText(formData, "agentId"),
      actorUserId: context.userId,
      tokenType: requiredText(formData, "tokenType") === "LINK" ? "LINK" : "QR",
      campaignRef: optionalText(formData, "campaignRef"),
      expiresAt: optionalText(formData, "expiresAt"),
    });
    revalidatePath(`/admin/agents/${requiredText(formData, "agentId")}`);
    const origin = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nsd.md";
    return {
      success: true,
      message: "Ссылка создана. Сохраните её сейчас: исходный токен больше не показывается.",
      referralUrl: `${origin.replace(/\/$/, "")}/a/${result.rawToken}`,
    };
  } catch {
    return { success: false, message: "Не удалось создать реферальную ссылку." };
  }
}

export async function revokeReferralTokenAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  const agentId = requiredText(formData, "agentId");
  await createAgentDomainService().revokeReferralToken(requiredText(formData, "tokenId"), context.userId);
  revalidatePath(`/admin/agents/${agentId}`);
}

export async function reviewAgentReferralAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  await createAgentDomainService().reviewReferral({
    referralId: requiredText(formData, "referralId"),
    action: requiredText(formData, "action") as "REVIEW" | "VERIFY" | "ACTIVATE" | "REJECT",
    actorUserId: context.userId,
    reason: optionalText(formData, "reason"),
  });
  revalidatePath("/admin/agents/referrals");
}

export async function captureAgentReferralAction(
  _previous: ReferralCaptureState,
  formData: FormData,
): Promise<ReferralCaptureState> {
  try {
    const result = await createAgentDomainService().captureReferral({
      rawToken: requiredText(formData, "token"),
      customerKind: requiredText(formData, "customerKind") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "PERSON",
      name: requiredText(formData, "name"),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      legalIdentifier: optionalText(formData, "legalIdentifier"),
      locality: optionalText(formData, "locality"),
      objectType: optionalText(formData, "objectType"),
      needSummary: requiredText(formData, "needSummary"),
      shortDescription: optionalText(formData, "shortDescription"),
      projectTiming: optionalText(formData, "projectTiming"),
      consent: formData.get("consent") === "on",
    });
    return {
      success: true,
      message: "Заявка принята. Представитель Novotech свяжется с вами после проверки.",
      referralId: result.referralId,
    };
  } catch {
    return { success: false, message: "Проверьте данные и действительность ссылки." };
  }
}

function requiredText(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function optionalText(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function optionalBoolean(formData: FormData, key: string): boolean | null {
  const value = optionalText(formData, key);
  if (value === null || value === "unknown") return null;
  return value === "true";
}
