"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/src/modules/admin/services";

import { createAccessRiskService } from "../service-factory";
import type { AccessRiskMonitoringMode } from "../types";

export async function setAccessRiskMonitoringAction(formData: FormData): Promise<void> {
  await requireAdminPermission("admin.security.manage");
  const companyId = String(formData.get("companyId") ?? "");
  const mode: AccessRiskMonitoringMode = formData.get("mode") === "ENHANCED" ? "ENHANCED" : "NORMAL";
  const durationRaw = Number(formData.get("durationDays") ?? 14);
  const durationDays: 7 | 14 | 30 = durationRaw === 7 || durationRaw === 30 ? durationRaw : 14;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  await createAccessRiskService().setMonitoring({ companyId, mode, durationDays, reason });
  revalidatePath("/admin/security/access-risk");
  revalidatePath(`/admin/security/access-risk/${companyId}`);
}
