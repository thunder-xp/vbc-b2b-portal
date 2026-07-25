import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createChunkedPriceSyncService } from "@/src/modules/integration/services";
import { launchPriceSync, PriceSyncLaunchError } from "@/src/modules/integration/sync/price-sync-continuation";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const triggerStartedAt = Date.now();
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createChunkedPriceSyncService(getOneCEnv());
  const start = await service.start();
  const syncId = start.state.activeSyncId;

  if (!start.started || !syncId) {
    console.info({
      event: "sync_skipped_locked",
      domain: "prices",
      runId: syncId,
      triggerResponseDurationMs: Date.now() - triggerStartedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json({ status: "skipped", syncId }, { status: 202 });
  }

  after(async () => {
    try {
      await launchPriceSync(syncId, new URL(request.url).origin);
    } catch (error) {
      const safeError = error instanceof PriceSyncLaunchError
        ? error.safeMessage
        : "Price continuation launch failed.";
      await service.failLaunch(syncId, safeError);
    }
  });

  console.info({
    event: "sync_started",
    domain: "prices",
    runId: syncId,
    triggerResponseDurationMs: Date.now() - triggerStartedAt,
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
  });
  return NextResponse.json({ status: "started", syncId }, { status: 202 });
}
