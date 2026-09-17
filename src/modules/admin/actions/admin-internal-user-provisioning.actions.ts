"use server";

import { revalidatePath } from "next/cache";

import { createAdminInternalUserProvisioningService, requireAdminPermission } from "../services";

export type FinanceOperatorInviteActionState = {
  status: "idle" | "invited" | "existing" | "error";
  requestId: string | null;
  authUserId: string | null;
};

export async function inviteFinanceOperatorAction(
  _state: FinanceOperatorInviteActionState,
  formData: FormData,
): Promise<FinanceOperatorInviteActionState> {
  await requireAdminPermission("admin.permissions.manage");
  try {
    const result = await createAdminInternalUserProvisioningService().invite(
      String(formData.get("email") ?? ""),
      String(formData.get("displayName") ?? ""),
      String(formData.get("reason") ?? ""),
    );
    revalidatePath("/admin/users");
    return {
      status: result.invited ? "invited" : "existing",
      requestId: result.requestId,
      authUserId: result.authUserId,
    };
  } catch {
    return { status: "error", requestId: null, authUserId: null };
  }
}
