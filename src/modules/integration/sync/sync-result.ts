import type { IntegrationDomainEvent } from "../events";
import type { AnySyncTarget } from "./sync-target";

export type SyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "skipped";

export type SyncItemCounts = {
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type SyncWarning = {
  code: string;
  message: string;
  itemReference: string | null;
};

export type SyncFailure = {
  code: string;
  message: string;
  itemReference: string | null;
  retryable: boolean;
};

export type SyncResult = {
  syncJobId: string;
  target: AnySyncTarget;
  status: SyncStatus;
  itemCounts: SyncItemCounts;
  warnings: SyncWarning[];
  failures: SyncFailure[];
  events: IntegrationDomainEvent[];
  startedAt: string;
  finishedAt: string | null;
};
