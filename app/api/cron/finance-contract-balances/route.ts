import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { acquireSyncRunLock, releaseSyncRunLock } from "@/src/modules/integration/sync";
import { createFinanceSyncCoordinator } from "@/src/modules/finance/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = crypto.randomUUID();
  const lock = await acquireSyncRunLock("scheduled_finance_contract_balances", runId, 900);
  if (lock === "locked") return NextResponse.json({ status: "locked", runId }, { status: 202 });

  after(async () => {
    try {
      const result = await createFinanceSyncCoordinator().synchronizeCompanies({ trigger: "scheduled", actorUserId: null });
      console.info({
        event: result.failed ? "sync_completed_with_warnings" : "sync_completed",
        domain: "finance_contract_balances",
        runId,
        eligibleCompanies: result.eligibleCompanies,
        succeeded: result.succeeded,
        zeroBalanceCompanies: result.zeroBalanceCompanies,
        missingMappings: result.missingMappings,
        failed: result.failed,
        locked: result.locked,
        publishedRows: result.publishedRows,
        oneCCallCount: result.oneCCallCount,
        durationMs: result.durationMs,
        deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      });
    } catch (error) {
      console.error({ event: "sync_failed", domain: "finance_contract_balances", runId, errorCode: error instanceof Error ? error.name : typeof error });
    } finally {
      await releaseSyncRunLock("scheduled_finance_contract_balances", runId);
    }
  });
  return NextResponse.json({ status: "started", runId }, { status: 202 });
}
