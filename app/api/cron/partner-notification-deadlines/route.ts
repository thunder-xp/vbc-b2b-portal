import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import {
  NotificationDeadlineService,
  SupabaseNotificationDeadlineRepository,
} from "@/src/modules/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await new NotificationDeadlineService(
      new SupabaseNotificationDeadlineRepository(),
    ).run();
    console.info({
      event: "partner_notification_deadline_worker_completed",
      runId: result.runId,
      status: result.status,
      sourceEventsProcessed: result.sourceEventsProcessed ?? 0,
      recipientsResolved: result.recipientsResolved ?? 0,
      notificationsCreated: result.notificationsCreated ?? 0,
      deduplicated: result.deduplicated ?? 0,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json(result, {
      status: result.status === "locked" ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "partner_notification_deadline_worker_failed",
      errorCode: error instanceof Error ? error.name : typeof error,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json(
      { status: "failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
