import type {
  AccessRiskCompanyDetail,
  AccessRiskMonitoringMode,
  AccessRiskOverview,
  AccessRiskTelemetryEvent,
} from "../types";

export type AccessRiskTelemetryWrite = {
  batchId: string;
  companyId: string;
  userId: string;
  sessionBuckets: number[];
  deviceBuckets: number[];
  networkBuckets: number[];
  sessionHash: string;
  deviceHash: string;
  networkHash: string | null;
  countryCode: string | null;
  regionCode: string | null;
  productBuckets: number[];
  categoryBuckets: number[];
  events: AccessRiskTelemetryEvent[];
};

export interface AccessRiskRepository {
  recordTelemetry(input: AccessRiskTelemetryWrite): Promise<void>;
  evaluate(companyLimit: number): Promise<Record<string, unknown>>;
  getOverview(input: {
    query?: string;
    riskState?: string;
    mode?: string;
    sort?: string;
    page: number;
    pageSize: number;
  }): Promise<AccessRiskOverview>;
  getCompany(companyId: string, before?: string, limit?: number): Promise<AccessRiskCompanyDetail>;
  setMonitoring(input: {
    companyId: string;
    mode: AccessRiskMonitoringMode;
    durationDays: 7 | 14 | 30;
    reason?: string;
  }): Promise<void>;
}

export class AccessRiskRepositoryError extends Error {
  constructor(readonly operation: string, readonly safeCode: string) {
    super(safeCode);
    this.name = "AccessRiskRepositoryError";
  }
}
