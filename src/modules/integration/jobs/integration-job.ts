import type { IntegrationDomainEvent } from "../events";

export type IntegrationJobType =
  | "catalog-import"
  | "pricing-import"
  | "inventory-import"
  | "order-export"
  | "documents-import"
  | "finance-import"
  | "partners-import";

export type IntegrationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type IntegrationJob<TPayload> = {
  id: string;
  type: IntegrationJobType;
  providerCode: string;
  correlationId: string;
  payload: TPayload;
  status: IntegrationJobStatus;
  attempts: number;
  createdAt: string;
  scheduledFor: string | null;
};

export type IntegrationJobResult = {
  jobId: string;
  status: IntegrationJobStatus;
  events: IntegrationDomainEvent[];
  warnings: string[];
  completedAt: string;
};

export interface IntegrationJobHandler<TPayload> {
  readonly jobType: IntegrationJobType;
  handle(job: IntegrationJob<TPayload>): Promise<IntegrationJobResult>;
}
