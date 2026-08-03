"use server";

import { getReleaseMetadata } from "@/src/lib/observability/release-metadata";
import { shouldLogDiagnostic } from "@/src/lib/observability/sampled-diagnostic";

import {
  createCompanyAccessService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { requireAdminPermission } from "../../admin/services";
import {
  BehaviorAnalyticsRepositoryError,
  SupabaseBehaviorAnalyticsRepository,
} from "../repositories";
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
    logAnalyticsFailure(error, [input]);
    return { recorded: false };
  }
}

export async function recordBehaviorEventsAction(
  inputs: RecordBehaviorEventInput[],
): Promise<{ recorded: boolean }> {
  if (inputs.length < 1 || inputs.length > 5) return { recorded: false };

  try {
    const userId = await getAuthenticatedUserId();
    await createService().recordBatch(userId, inputs);
    return { recorded: true };
  } catch (error) {
    logAnalyticsFailure(error, inputs);
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

function logAnalyticsFailure(
  error: unknown,
  inputs: RecordBehaviorEventInput[],
): void {
  const repositoryError = error instanceof BehaviorAnalyticsRepositoryError
    ? error
    : null;
  const eventNames = inputs.map((input) => input.eventName);
  const sampleKey = `${repositoryError?.databaseCode ?? "unknown"}:${eventNames.join(",")}`;
  if (!shouldLogDiagnostic(sampleKey)) return;
  console.warn({
    event: "partner_behavior_event_persistence_failed",
    correlationId: crypto.randomUUID(),
    operation: repositoryError?.operation ?? "behavior_event_validation",
    rpc: repositoryError?.operation ?? null,
    stage: "analytics_persistence",
    eventNames,
    eventCount: inputs.length,
    errorType: error instanceof Error ? error.name : typeof error,
    sqlState: repositoryError?.databaseCode ?? null,
    safeDatabaseMessage: repositoryError?.databaseMessage ?? null,
    details: repositoryError?.databaseDetails ?? null,
    hint: repositoryError?.databaseHint ?? null,
    constraint: repositoryError?.databaseConstraint ?? null,
    stack: error instanceof Error ? error.stack : null,
    ...getReleaseMetadata(),
  });
}
