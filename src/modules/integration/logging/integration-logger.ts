import type { IntegrationDirection, IntegrationOperationStatus } from "../dto";

export type IntegrationLogEntry = {
  id: string;
  providerCode: string;
  domain: string;
  operation: string;
  direction: IntegrationDirection;
  status: IntegrationOperationStatus;
  correlationId: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  message: string | null;
};

export type StartIntegrationLogInput = Omit<
  IntegrationLogEntry,
  "id" | "finishedAt" | "durationMs" | "message" | "status"
> & {
  status?: IntegrationOperationStatus;
  message?: string | null;
};

export interface IntegrationLogger {
  start(input: StartIntegrationLogInput): Promise<IntegrationLogEntry>;
  finish(
    entryId: string,
    status: IntegrationOperationStatus,
    message?: string | null,
  ): Promise<IntegrationLogEntry>;
  record(entry: IntegrationLogEntry): Promise<void>;
}
