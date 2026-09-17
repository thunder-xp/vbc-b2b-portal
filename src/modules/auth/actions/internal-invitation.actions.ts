"use server";

import { createAdminInternalUserProvisioningService } from "@/src/modules/admin/services";

export type InternalInvitationActivationResult = {
  success: boolean;
  error: "activation_failed" | null;
};

export async function activateInternalInvitationAction(): Promise<InternalInvitationActivationResult> {
  try {
    await createAdminInternalUserProvisioningService().activateCurrent();
    return { success: true, error: null };
  } catch {
    return { success: false, error: "activation_failed" };
  }
}
