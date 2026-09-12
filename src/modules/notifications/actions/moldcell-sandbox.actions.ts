"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminPermission } from "../../admin/services";
import {
  MoldcellSandboxError,
  MoldcellSandboxService,
  SupabaseDurableCommunicationRepository,
  SupabaseNotificationDeliveryRepository,
  type MoldcellSmsReadiness,
} from "../gateway";
import { SupabaseMoldcellSmsHealthRepository } from "../repositories/moldcell-sms-health.repository";

export type MoldcellSandboxActionState = Readonly<{
  status: "idle" | "accepted" | "failed";
  message: string | null;
  result: Readonly<{
    deliveryId: string;
    attemptId: string | null;
    provider: string;
    normalizedPhone: string;
    providerStatus: string;
    providerCode: string | null;
    providerTimestamp: string | null;
    durationMs: number;
  }> | null;
}>;

export async function getMoldcellSmsReadinessAction(): Promise<MoldcellSmsReadiness> {
  await requireAdminPermission("admin.integrations.view");
  return service().getReadiness();
}

export async function sendMoldcellSandboxTestAction(
  _previous: MoldcellSandboxActionState,
  formData: FormData,
): Promise<MoldcellSandboxActionState> {
  const context = await requireAdminPermission("admin.integrations.manage");
  const parsed = z.object({
    recipientToken: z.string().regex(/^[0-9a-f]{64}$/),
    message: z.string().trim().min(1).max(140),
  }).safeParse({
    recipientToken: formData.get("recipientToken"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { status: "failed", message: "INVALID_TEST_INPUT", result: null };
  try {
    const result = await service().sendSandbox({ operatorUserId: context.userId, ...parsed.data });
    revalidatePath("/admin/integrations/notifications");
    return {
      status: result.providerStatus === "PROVIDER_ACCEPTED" ? "accepted" : "failed",
      message: result.providerStatus,
      result,
    };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof MoldcellSandboxError ? error.safeCode : "MOLDCELL_SANDBOX_FAILED",
      result: null,
    };
  }
}

function service(): MoldcellSandboxService {
  return new MoldcellSandboxService(
    new SupabaseDurableCommunicationRepository(),
    new SupabaseNotificationDeliveryRepository(),
    new SupabaseMoldcellSmsHealthRepository(),
  );
}
