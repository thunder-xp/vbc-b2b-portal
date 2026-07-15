import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";

export type SyncLockResult = "acquired" | "locked" | "stale_lock_recovered";

export async function acquireSyncRunLock(scope: string, runId: string, ttlSeconds: number): Promise<SyncLockResult> {
  const { data, error } = await createAdminClient().rpc("acquire_integration_sync_lock", {
    p_scope: scope,
    p_run_id: runId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error || !isSyncLockResult(data)) throw new Error("Synchronization lock acquisition failed.");
  return data;
}

export async function releaseSyncRunLock(scope: string, runId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("release_integration_sync_lock", {
    p_scope: scope,
    p_run_id: runId,
  });
  if (error) throw new Error("Synchronization lock release failed.");
}

function isSyncLockResult(value: unknown): value is SyncLockResult {
  return value === "acquired" || value === "locked" || value === "stale_lock_recovered";
}
