import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";

export async function projectPartnerProductTransitions(
  sourceSyncId: string,
): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc(
      "process_partner_product_transitions",
      {
        p_source_sync_id: sourceSyncId,
        p_limit: 500,
      },
    );
    if (error) {
      console.error({
        event: "partner_product_notification_projection_failed",
        sourceSyncId,
        safeErrorCode: error.code ?? "unknown",
      });
    }
  } catch (error) {
    console.error({
      event: "partner_product_notification_projection_failed",
      sourceSyncId,
      safeErrorCode: safeCode(error),
    });
  }
}

function safeCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return "unexpected_projection_error";
}
