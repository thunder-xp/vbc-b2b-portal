"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminInternalUserProvisioningService } from "@/src/modules/admin/services";

export type InternalInvitationActivationState =
  | "VERIFYING"
  | "READY"
  | "INVALID_INVITE"
  | "EXPIRED_INVITE"
  | "ALREADY_USED"
  | "ACTIVATING"
  | "COMPLETED"
  | "ERROR";

export type InternalInvitationReadinessResult = {
  state: InternalInvitationActivationState;
};

export type InternalInvitationActivationResult = {
  success: boolean;
  error: "activation_failed" | null;
};

export async function getInternalInvitationReadinessAction(): Promise<InternalInvitationReadinessResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { state: "INVALID_INVITE" };

  try {
    const provisioning = await createAdminInternalUserProvisioningService().getCurrent();
    if (!provisioning) return { state: "INVALID_INVITE" };
    return { state: provisioning.status === "active" ? "ALREADY_USED" : "READY" };
  } catch {
    return { state: "ERROR" };
  }
}

export async function activateInternalInvitationAction(): Promise<InternalInvitationActivationResult> {
  try {
    await createAdminInternalUserProvisioningService().activateCurrent();
    return { success: true, error: null };
  } catch {
    return { success: false, error: "activation_failed" };
  }
}
