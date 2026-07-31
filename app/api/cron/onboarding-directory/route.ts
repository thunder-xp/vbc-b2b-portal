import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import {
  CounterpartyDirectorySyncService,
  OneCCounterpartyDirectorySource,
} from "@/src/modules/onboarding/services";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await new CounterpartyDirectorySyncService(
      new OneCCounterpartyDirectorySource(getOneCEnv()),
    ).synchronize();
    console.info({
      event: "onboarding_directory_cron_completed",
      syncId: result.syncId,
      published: result.published,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json({ status: "succeeded", ...result });
  } catch (error) {
    console.error({
      event: "onboarding_directory_cron_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json(
      { status: "failed", safeError: "Counterparty directory synchronization failed." },
      { status: 500 },
    );
  }
}
