"use server";

import { getPartnerLocale } from "@/src/modules/partner-locale/server";

import { adminPartnerPasswordCopy, type AdminPartnerPasswordErrorCode } from "../password-change-copy";
import {
  AdminPartnerPasswordChangeError,
  createAdminPartnerPasswordService,
  requireAdminPermission,
} from "../services";

export type AdminPartnerPasswordActionState = {
  status: "idle" | "success" | "error" | "partial";
  message: string;
  correlationId: string | null;
};

export async function changeAdminPartnerPasswordAction(
  _previous: AdminPartnerPasswordActionState,
  formData: FormData,
): Promise<AdminPartnerPasswordActionState> {
  const correlationId = crypto.randomUUID();
  const copy = adminPartnerPasswordCopy(await getPartnerLocale());
  try {
    const context = await requireAdminPermission("admin.partner_integrity.manage");
    await createAdminPartnerPasswordService().changePassword({
      actorUserId: context.userId,
      targetProfileId: String(formData.get("targetProfileId") ?? ""),
      password: String(formData.get("newPassword") ?? ""),
      confirmation: String(formData.get("confirmPassword") ?? ""),
      correlationId,
    });
    return { status: "success", message: copy.success, correlationId };
  } catch (error) {
    const code = safeErrorCode(error);
    const partial = code === "AUDIT_FAILED_AFTER_CHANGE";
    console.error({
      event: "admin_partner_password_change_failed",
      correlationId,
      errorCode: code,
      partial,
    });
    return {
      status: partial ? "partial" : "error",
      message: partial ? `${copy.partial} ${correlationId}` : copy.errors[code],
      correlationId,
    };
  }
}

function safeErrorCode(error: unknown): AdminPartnerPasswordErrorCode {
  if (error instanceof AdminPartnerPasswordChangeError) return error.code;
  if (error instanceof Error && ["ForbiddenError", "PermissionRequiredError", "UnauthenticatedError"].includes(error.name)) {
    return "PERMISSION_DENIED";
  }
  return "SYSTEM_ERROR";
}
