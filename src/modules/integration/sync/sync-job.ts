import type { AnySyncStrategy } from "./sync-strategy";
import type { AnySyncTarget } from "./sync-target";

export type SyncJobStatus =
  | "created"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export type SyncJob = {
  id: string;
  target: AnySyncTarget;
  strategy: AnySyncStrategy;
  status: SyncJobStatus;
  attempt: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type CreateSyncJobInput = {
  target: AnySyncTarget;
  strategy: AnySyncStrategy;
};
