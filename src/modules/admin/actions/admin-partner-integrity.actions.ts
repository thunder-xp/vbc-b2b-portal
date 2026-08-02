"use server";

import { revalidatePath } from "next/cache";

import { createAdminPartnerIntegrityService, requireAdminPermission } from "../services";

export type PartnerIntegrityActionState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  correlationId: string | null;
};

export async function repairApprovedOnboardingAction(
  _previous: PartnerIntegrityActionState,
  formData: FormData,
): Promise<PartnerIntegrityActionState> {
  return execute(formData, true);
}

export async function moveOrAddPartnerMembershipAction(
  _previous: PartnerIntegrityActionState,
  formData: FormData,
): Promise<PartnerIntegrityActionState> {
  return execute(formData, false);
}

async function execute(formData: FormData, onboardingRepair: boolean): Promise<PartnerIntegrityActionState> {
  const correlationId = crypto.randomUUID();
  try {
    await requireAdminPermission("admin.partner_integrity.manage");
    const common = {
      sourceMembershipId: text(formData, "sourceMembershipId"),
      expectedSourceVersion: Number(formData.get("sourceVersion")),
      mode: mode(formData),
      roleCode: text(formData, "roleCode"),
      reason: text(formData, "reason"),
      operationKey: text(formData, "operationKey") || crypto.randomUUID(),
      correlationId,
    } as const;
    const service = createAdminPartnerIntegrityService();
    const result = onboardingRepair
      ? await service.repairApprovedRequest({
          ...common,
          requestId: text(formData, "requestId"),
          counterpartyId: text(formData, "counterpartyId"),
        })
      : await service.mutateMembership({
          ...common,
          userId: text(formData, "userId"),
          targetCompanyId: text(formData, "targetCompanyId"),
        });
    revalidatePath(`/admin/partners/users/${text(formData, "userId")}`);
    if (onboardingRepair) revalidatePath(`/admin/onboarding/${text(formData, "requestId")}`);
    revalidatePath("/admin/companies");
    return {
      status: "success",
      message: result.idempotent ? "Изменение уже было применено." : "Связь компании и пользователя обновлена.",
      correlationId: result.correlationId,
    };
  } catch (error) {
    const conflict = error instanceof Error && error.message.includes("stale_membership_version");
    console.error({
      event: "admin_partner_integrity_repair_failed",
      correlationId,
      conflict,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      status: conflict ? "conflict" : "error",
      message: conflict
        ? "Членство уже изменено другим администратором. Обновите страницу."
        : `Не удалось выполнить исправление. Код обращения: ${correlationId}`,
      correlationId,
    };
  }
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function mode(formData: FormData): "move" | "add" {
  return formData.get("mode") === "add" ? "add" : "move";
}
