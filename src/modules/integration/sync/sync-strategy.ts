import type { IntegrationSyncWindowDTO } from "../dto";

export type SyncTriggerType = "manual" | "scheduled" | "on-demand";

export type SyncConflictPolicy =
  | "source-wins"
  | "skip-existing"
  | "fail-on-conflict";

export type SyncStrategy = {
  triggerType: SyncTriggerType;
  syncWindow: IntegrationSyncWindowDTO;
  conflictPolicy: SyncConflictPolicy;
  dryRun: boolean;
  maxAttempts: number;
  correlationId: string;
};

export type ManualSyncStrategy = SyncStrategy & {
  triggerType: "manual";
  requestedByUserId: string;
  reason: string | null;
};

export type ScheduledSyncStrategy = SyncStrategy & {
  triggerType: "scheduled";
  scheduleCode: string;
};

export type OnDemandSyncStrategy = SyncStrategy & {
  triggerType: "on-demand";
  requestedByWorkflow: string;
};

export type AnySyncStrategy =
  | ManualSyncStrategy
  | ScheduledSyncStrategy
  | OnDemandSyncStrategy;
