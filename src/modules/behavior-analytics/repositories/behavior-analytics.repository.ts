import type {
  BehaviorAnalyticsPreview,
  RecordBehaviorEventInput,
} from "../types";

export interface BehaviorAnalyticsRepository {
  record(
    companyId: string,
    input: RecordBehaviorEventInput,
  ): Promise<string>;
  recordBatch(
    companyId: string,
    inputs: RecordBehaviorEventInput[],
  ): Promise<string[]>;
  getAdminPreview(days: number, limit: number): Promise<BehaviorAnalyticsPreview>;
}

export class BehaviorAnalyticsRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly databaseCode: string | null = null,
    readonly databaseMessage: string | null = null,
    readonly databaseDetails: string | null = null,
    readonly databaseHint: string | null = null,
    readonly databaseConstraint: string | null = null,
    options?: ErrorOptions,
  ) {
    super("Behavior analytics repository failed.", options);
    this.name = "BehaviorAnalyticsRepositoryError";
  }
}
