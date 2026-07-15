import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createExchangeRateSyncService } from "@/src/modules/integration/services";
import { acquireSyncRunLock, releaseSyncRunLock } from "@/src/modules/integration/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const triggerStartedAt = Date.now();
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = crypto.randomUUID();
  const lock = await acquireSyncRunLock("commercial_rate", runId, 300);
  if (lock === "locked") return NextResponse.json({ status: "locked", runId }, { status: 202 });
  console.info({ event: lock === "stale_lock_recovered" ? "stale_lock_recovered" : "sync_lock_acquired", domain: "commercial_rate", runId, triggerResponseDurationMs: Date.now() - triggerStartedAt, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
  after(async () => {
    const startedAt = Date.now();
    try {
      const result = await createExchangeRateSyncService(getOneCEnv()).sync();
      console.info({ event: "sync_completed", domain: "commercial_rate", runId, updated: 1, durationMs: Date.now() - startedAt, sourceDocumentDate: result.sourceDocumentDate, cacheInvalidationScope: "none_dynamic_read_model", deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    } catch (error) {
      console.error({ event: "sync_failed", domain: "commercial_rate", runId, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    } finally { await releaseSyncRunLock("commercial_rate", runId); }
  });
  return NextResponse.json({ status: "started", runId }, { status: 202 });
}
