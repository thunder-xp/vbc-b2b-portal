import type { SyncJob } from "./sync-job";
import type { SyncResult, SyncStatus } from "./sync-result";

export type SyncLogEntry = {
  id: string;
  syncJobId: string;
  providerCode: string;
  targetCode: string;
  domain: string;
  status: SyncStatus;
  correlationId: string;
  message: string | null;
  createdAt: string;
};

export type StartSyncLogInput = {
  job: SyncJob;
  message?: string | null;
};

export interface SyncLogger {
  start(input: StartSyncLogInput): Promise<SyncLogEntry>;
  recordResult(result: SyncResult): Promise<SyncLogEntry>;
  recordFailure(job: SyncJob, error: unknown): Promise<SyncLogEntry>;
}
