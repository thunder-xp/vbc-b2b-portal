"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { createPartnerMomentumService, getAuthenticatedUser } from "./service-factory";

const statusSchema = z.enum(["growth", "stable", "slowing", "attention_required", "high_risk", "insufficient_history", "recovered"]);

export async function listPartnerMomentumAdminAction(input: { page?: number; pageSize?: number; status?: string | null; managerId?: string | null; search?: string | null }) {
  await requireAdminPermission("partner_momentum.view_assigned");
  const status = input.status ? statusSchema.safeParse(input.status) : null;
  if (status && !status.success) return invalidInput("Некорректный статус динамики.");
  try {
    return success("Динамика партнёров загружена.", await createPartnerMomentumService().listAdmin({ ...input, status: status?.data ?? null }));
  } catch (error) { return failureFromError(error); }
}

export async function getPartnerMomentumDiagnosticsAction() {
  await requireAdminPermission("partner_momentum.analytics.view");
  return createPartnerMomentumService().getDiagnostics();
}

export async function dismissPartnerMomentumPromptAction(formData: FormData): Promise<void> {
  const fingerprint = z.string().min(1).max(128).safeParse(formData.get("fingerprint"));
  if (!fingerprint.success) throw new Error("Momentum prompt is stale.");
  const user = await getAuthenticatedUser();
  await createPartnerMomentumService().recordPartnerAction(user.id, { actionType: "action_dismissed", actionKey: "dashboard_prompt", sourceFingerprint: fingerprint.data });
  revalidatePath("/cabinet");
}
