import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import {
  NotificationDeliveryWorkerService,
  SmtpNotificationChannelAdapter,
  SupabaseNotificationDeliveryRepository,
} from "@/src/modules/notifications/gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await new NotificationDeliveryWorkerService(
      new SupabaseNotificationDeliveryRepository(),
      [new SmtpNotificationChannelAdapter()],
    ).run();
    console.info({
      event: "notification_delivery_worker_completed",
      ...result,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "notification_delivery_worker_failed",
      errorCategory: error instanceof Error ? error.name : typeof error,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json(
      { status: "failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
