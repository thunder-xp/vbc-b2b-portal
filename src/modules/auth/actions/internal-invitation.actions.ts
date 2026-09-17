"use server";

import { createClient } from "@/src/lib/supabase/server";
import { createAdminInternalUserProvisioningService } from "@/src/modules/admin/services";

import { passwordPolicyIssue } from "../password-policy";

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
  error: "activation_failed" | "invalid_password" | null;
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

export async function activateInternalInvitationAction(password: string): Promise<InternalInvitationActivationResult> {
  if (passwordPolicyIssue(password)) return { success: false, error: "invalid_password" };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { success: false, error: "activation_failed" };

    const service = createAdminInternalUserProvisioningService();
    const provisioning = await service.getCurrent();
    if (!provisioning || provisioning.status !== "invited") {
      return { success: false, error: "activation_failed" };
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) return { success: false, error: "activation_failed" };

    await service.activateCurrent();
    return { success: true, error: null };
  } catch {
    return { success: false, error: "activation_failed" };
  }
}
