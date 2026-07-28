"use server";

import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { requireAdminPermission } from "../../admin/services";
import { SupabaseBehaviorAnalyticsRepository } from "../repositories";
import { BehaviorAnalyticsService } from "../services";
import type {
  BehaviorAnalyticsPreview,
  RecordBehaviorEventInput,
} from "../types";

export async function recordBehaviorEventAction(
  input: RecordBehaviorEventInput,
): Promise<{ recorded: boolean }> {
  try {
    const userId = await getAuthenticatedUserId();
    await createService().record(userId, input);
    return { recorded: true };
  } catch (error) {
    console.warn({
      event: "partner_behavior_event_recording_warning",
      eventName: input.eventName,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { recorded: false };
  }
}

export async function getBehaviorAnalyticsPreviewAction(): Promise<
  BehaviorAnalyticsPreview
> {
  await requireAdminPermission("admin.analytics.view");
  return createService().getAdminPreview();
}

function createService(): BehaviorAnalyticsService {
  return new BehaviorAnalyticsService(
    new SupabaseBehaviorAnalyticsRepository(),
    createCompanyAccessService(),
  );
}
