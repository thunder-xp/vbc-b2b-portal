import type { IntegrationJob, IntegrationJobType } from "../jobs";

export type EnqueueIntegrationJobInput<TPayload> = {
  type: IntegrationJobType;
  providerCode: string;
  correlationId: string;
  payload: TPayload;
  scheduledFor?: string | null;
};

export interface IntegrationQueue {
  enqueue<TPayload>(
    input: EnqueueIntegrationJobInput<TPayload>,
  ): Promise<IntegrationJob<TPayload>>;
  dequeue<TPayload>(
    jobTypes: IntegrationJobType[],
  ): Promise<IntegrationJob<TPayload> | null>;
  markSucceeded(jobId: string): Promise<void>;
  markFailed(jobId: string, reason: string): Promise<void>;
}
