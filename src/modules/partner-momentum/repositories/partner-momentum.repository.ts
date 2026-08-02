import type {
  AdminMomentumPage,
  MomentumCalculation,
  MomentumSource,
  MomentumStatus,
  PartnerMomentumSummary,
} from "../types";

export interface PartnerMomentumRepository {
  getPartnerSummary(companyId: string): Promise<PartnerMomentumSummary | null>;
  listAdmin(input: { page: number; pageSize: number; status: MomentumStatus | null; managerId: string | null; search: string | null }): Promise<AdminMomentumPage>;
  getDiagnostics(): Promise<Record<string, unknown>>;
  recordAction(input: { companyId: string; actionType: string; actionKey: string; sourceFingerprint: string }): Promise<void>;
}

export interface PartnerMomentumProjectionRepository {
  enqueueAll(): Promise<number>;
  claim(limit: number): Promise<string[]>;
  loadSource(companyId: string): Promise<MomentumSource>;
  publish(calculation: MomentumCalculation): Promise<{ snapshotId: string; transitionCreated: number }>;
  fail(companyId: string, code: string): Promise<void>;
}

export class PartnerMomentumRepositoryError extends Error {
  constructor() {
    super("Partner momentum data is unavailable.");
    this.name = "PartnerMomentumRepositoryError";
  }
}

