import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

export async function recordOneCHealthAudit(
  status: "passed" | "failed",
  durationMs: number,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_internal_diagnostic_event", {
    p_diagnostic_code: "one_c_health",
    p_result_status: status,
    p_duration_ms: Math.max(0, Math.round(durationMs)),
  });

  if (error) {
    throw new RepositoryUnexpectedError({
      operation: "record_internal_diagnostic_event",
      table: "internal_diagnostic_audit_events",
      payloadKeys: [
        "p_diagnostic_code",
        "p_result_status",
        "p_duration_ms",
      ],
      cause: error,
    });
  }
}
