import type {
  BehaviorAnalyticsPreview,
  RecordBehaviorEventInput,
} from "../types";

export interface BehaviorAnalyticsRepository {
  record(
    companyId: string,
    input: RecordBehaviorEventInput,
  ): Promise<string>;
  getAdminPreview(days: number, limit: number): Promise<BehaviorAnalyticsPreview>;
}

export class BehaviorAnalyticsRepositoryError extends Error {
  constructor(readonly databaseCode?: string) {
    super("Behavior analytics repository failed.");
    this.name = "BehaviorAnalyticsRepositoryError";
  }
}
