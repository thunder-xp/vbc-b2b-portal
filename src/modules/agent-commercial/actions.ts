"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/src/modules/admin";
import { createAgentCommercialService } from "./service";
import type { AgentCommissionClassification, AgentRewardState } from "./types";

export async function bindCommercialAgentOneCAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_commercial.manage");
  if (formData.get("confirmExact") !== "on") throw new Error("EXACT_ONEC_CONFIRMATION_REQUIRED");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().bindAgent(agentId, required(formData, "sourceReference"), context.userId);
  revalidatePath(`/admin/agents/${agentId}`);
}

export async function linkAgentSaleAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_commercial.manage");
  if (formData.get("confirmExact") !== "on") throw new Error("EXACT_ONEC_CONFIRMATION_REQUIRED");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().linkSale({
    agentId, attributionId: required(formData, "attributionId"),
    orderReference: required(formData, "orderReference"), actorUserId: context.userId,
  });
  revalidatePath(`/admin/agents/${agentId}`);
}

export async function importAndLinkAgentSaleAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_commercial.manage");
  if (formData.get("confirmExact") !== "on") throw new Error("EXACT_ONEC_CONFIRMATION_REQUIRED");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().importAndLinkSale({
    agentId, orderReference: required(formData, "orderReference"), actorUserId: context.userId,
  });
  revalidatePath(`/admin/agents/${agentId}`); revalidatePath("/agent"); revalidatePath("/agent/deals");
}

export async function refreshAgentSaleAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_commercial.manage");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().refreshSale(required(formData, "saleLinkId"), context.userId);
  revalidatePath(`/admin/agents/${agentId}`);
  revalidatePath("/agent/deals"); revalidatePath("/agent/rewards"); revalidatePath("/agent");
}

export async function classifyAgentNomenclatureAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_commercial.manage");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().classify({
    reference: required(formData, "reference"), name: required(formData, "name"),
    classification: required(formData, "classification") as AgentCommissionClassification, actorUserId: context.userId,
  });
  revalidatePath(`/admin/agents/${agentId}`);
}

export async function transitionAgentRewardAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agent_rewards.approve");
  const agentId = required(formData, "agentId");
  await createAgentCommercialService().transitionReward({
    saleLinkId: required(formData, "saleLinkId"), targetState: required(formData, "targetState") as AgentRewardState,
    actorUserId: context.userId, reason: optional(formData, "reason"),
  });
  revalidatePath(`/admin/agents/${agentId}`); revalidatePath("/agent/rewards");
}

function required(formData: FormData, key: string): string { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`Missing ${key}`); return value; }
function optional(formData: FormData, key: string): string | null { return String(formData.get(key) ?? "").trim() || null; }
