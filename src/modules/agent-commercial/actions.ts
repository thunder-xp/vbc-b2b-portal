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
  const saleLinkId = required(formData, "saleLinkId");
  revalidatePath(`/admin/agents/${agentId}`); revalidatePath("/admin/agents/rewards");
  revalidatePath(`/admin/agents/rewards/${saleLinkId}`); revalidatePath("/admin");
  revalidatePath("/agent/rewards"); revalidatePath(`/agent/deals/${saleLinkId}`);
}

export type AgentRewardPayoutActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function confirmAgentRewardPayoutAction(
  _previous: AgentRewardPayoutActionState,
  formData: FormData,
): Promise<AgentRewardPayoutActionState> {
  const context = await requireAdminPermission("admin.agent_rewards.approve");
  if (formData.get("confirmPayout") !== "on") {
    return { status: "error", message: "Подтвердите, что выплата действительно выполнена." };
  }
  const saleLinkId = required(formData, "saleLinkId");
  try {
    const result = await createAgentCommercialService().confirmPayout({
      saleLinkId,
      actorUserId: context.userId,
      expectedUpdatedAt: required(formData, "expectedUpdatedAt"),
      idempotencyKey: required(formData, "idempotencyKey"),
      payoutReference: required(formData, "payoutReference"),
      note: optional(formData, "note"),
    });
    revalidatePath("/admin"); revalidatePath("/admin/agents/rewards");
    revalidatePath(`/admin/agents/rewards/${saleLinkId}`);
    revalidatePath("/agent"); revalidatePath("/agent/rewards"); revalidatePath(`/agent/deals/${saleLinkId}`);
    return {
      status: "success",
      message: result.outcome === "ALREADY_APPLIED"
        ? "Эта выплата уже была зарегистрирована. Повторная запись не создана."
        : "Выплата зарегистрирована один раз и добавлена в аудит.",
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "REWARD_PAYOUT_CONFLICT") {
      return { status: "error", message: "Вознаграждение уже изменено другим пользователем. Обновите страницу." };
    }
    if (code === "REWARD_NOT_READY_FOR_PAYOUT") {
      return { status: "error", message: "Вознаграждение больше не готово к выплате. Проверьте коммерческие данные." };
    }
    return { status: "error", message: "Не удалось зарегистрировать выплату. Состояние не изменено." };
  }
}

function required(formData: FormData, key: string): string { const value = String(formData.get(key) ?? "").trim(); if (!value) throw new Error(`Missing ${key}`); return value; }
function optional(formData: FormData, key: string): string | null { return String(formData.get(key) ?? "").trim() || null; }
