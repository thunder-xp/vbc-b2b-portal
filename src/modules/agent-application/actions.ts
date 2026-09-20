"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import { requireAdminPermission } from "@/src/modules/admin/services";

import { createCommercialAgentApplicationService } from "./factory";
import { CommercialAgentApplicationValidationError } from "./service";
import type { CommercialAgentApplication, CommercialAgentApplicationReviewAction } from "./types";

export type CommercialAgentApplicationActionState = {
  success: boolean;
  message: string | null;
  application: CommercialAgentApplication | null;
};

export async function submitCommercialAgentApplicationAction(
  _previous: CommercialAgentApplicationActionState,
  formData: FormData,
): Promise<CommercialAgentApplicationActionState> {
  try {
    const user = await getAuthenticatedUser();
    const application = await createCommercialAgentApplicationService().submit(user.id, user.email, {
      displayName: text(formData, "displayName"),
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      locality: optionalText(formData, "locality"),
      profession: optionalText(formData, "profession"),
      workplace: optionalText(formData, "workplace"),
      agentType: text(formData, "agentType") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL",
      legalName: optionalText(formData, "legalName"),
    });
    revalidatePath("/become-partner/agent");
    return { success: true, message: "APPLICATION_SUBMITTED", application };
  } catch (error) {
    return {
      success: false,
      message: error instanceof CommercialAgentApplicationValidationError
        ? error.message
        : "APPLICATION_SUBMISSION_FAILED",
      application: null,
    };
  }
}

export async function withdrawCommercialAgentApplicationAction(): Promise<void> {
  const user = await getAuthenticatedUser();
  await createCommercialAgentApplicationService().withdraw(user.id);
  revalidatePath("/become-partner/agent");
}

export async function reviewCommercialAgentApplicationAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.agents.manage");
  await createCommercialAgentApplicationService().review({
    applicationId: text(formData, "applicationId"),
    actorUserId: context.userId,
    action: reviewAction(text(formData, "action")),
    safeNote: optionalText(formData, "safeNote"),
  });
  revalidatePath("/admin/agents");
  revalidatePath("/admin/agents/applications");
  revalidatePath(`/admin/agents/applications/${text(formData, "applicationId")}`);
  revalidatePath("/become-partner/agent");
}

function reviewAction(value: string): CommercialAgentApplicationReviewAction {
  if (value === "REQUEST_CLARIFICATION" || value === "APPROVE" || value === "REJECT") return value;
  throw new CommercialAgentApplicationValidationError("Review action is invalid.");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}
