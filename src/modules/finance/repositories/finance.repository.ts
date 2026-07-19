import type { ContractBalanceDTO } from "../../integration/dto";
import type { FinanceSyncCompany, FinanceSyncState, PartnerContractBalance } from "../types";
import type { ContractBalanceFetchDiagnosticsDTO } from "../../integration/contracts";

export type PublishContractBalanceSnapshotInput = {
  companyId: string;
  counterpartyRef: string;
  synchronizedAt: string;
  rows: ContractBalanceDTO[];
};

export interface FinanceRepository {
  canRunFinanceSync(): Promise<boolean>;
  listActiveContractBalances(companyId: string): Promise<PartnerContractBalance[]>;
  getOverviewData(companyId: string): Promise<{ balances: PartnerContractBalance[]; syncState: FinanceSyncState | null }>;
  getSyncCompany(companyId: string): Promise<FinanceSyncCompany | null>;
  listSyncCompanies(input: { afterCompanyId?: string; limit: number }): Promise<FinanceSyncCompany[]>;
  publishContractBalanceSnapshot(input: PublishContractBalanceSnapshotInput): Promise<number>;
  publishContractBalanceSnapshotV2(input: PublishContractBalanceSnapshotInput & {
    durationMs: number;
    diagnostics: ContractBalanceFetchDiagnosticsDTO;
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
  }): Promise<number>;
  recordSyncResult(input: {
    companyId: string;
    status: "running" | "failed" | "mapping_missing" | "locked";
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
    errorCode?: string;
    durationMs?: number;
  }): Promise<void>;
}
