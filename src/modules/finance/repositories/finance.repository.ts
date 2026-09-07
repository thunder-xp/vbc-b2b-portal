import type { ContractBalanceDTO } from "../../integration/dto";
import type {
  FinanceSyncCompany,
  FinanceSyncState,
  PartnerContractBalance,
  PartnerPaymentObligation,
  PaymentObligationExclusion,
  PublishPaymentObligation,
  FinanceReminderCandidate,
  FinanceReminderDryRun,
  FinanceReminderProjection,
  FinanceReminderSuppression,
  AdminFinanceOperations,
} from "../types";
import type { ContractBalanceFetchDiagnosticsDTO } from "../../integration/contracts";

export type PublishContractBalanceSnapshotInput = {
  companyId: string;
  counterpartyRef: string;
  synchronizedAt: string;
  rows: ContractBalanceDTO[];
};

export type PublishFinanceSnapshotInput = PublishContractBalanceSnapshotInput & {
  obligations: PublishPaymentObligation[];
  exclusions: PaymentObligationExclusion[];
  durationMs: number;
  obligationDiagnostics: {
    ordersReceived: number;
    paymentCalendarOrders: number;
    emptyCalendarOrders: number;
    bankPaymentsReceived: number;
    cashPaymentsReceived: number;
    balanceRowsReceived: number;
    oneCCallCount: number;
  };
  balanceDiagnostics: ContractBalanceFetchDiagnosticsDTO;
  trigger: "manual" | "scheduled";
  actorUserId: string | null;
};

export interface FinanceRepository {
  canRunFinanceSync(): Promise<boolean>;
  listActiveContractBalances(companyId: string): Promise<PartnerContractBalance[]>;
  getOverviewData(companyId: string): Promise<{
    balances: PartnerContractBalance[];
    obligations: PartnerPaymentObligation[];
    unavailableCount: number;
    syncState: FinanceSyncState | null;
  }>;
  getSyncCompany(companyId: string): Promise<FinanceSyncCompany | null>;
  listSyncCompanies(input: { afterCompanyId?: string; limit: number }): Promise<FinanceSyncCompany[]>;
  publishContractBalanceSnapshot(input: PublishContractBalanceSnapshotInput): Promise<number>;
  publishContractBalanceSnapshotV2(input: PublishContractBalanceSnapshotInput & {
    durationMs: number;
    diagnostics: ContractBalanceFetchDiagnosticsDTO;
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
  }): Promise<number>;
  publishFinanceSnapshot(input: PublishFinanceSnapshotInput): Promise<{ balances: number; obligations: number; exclusions: number }>;
  getReminderDryRunInput(): Promise<FinanceReminderCandidate[]>;
  listDeliveredReminderIdentities(deliveryIdentities: string[]): Promise<string[]>;
  publishReminderDryRun(input: {
    businessDate: string;
    durationMs: number;
    projections: FinanceReminderProjection[];
    suppressions: FinanceReminderSuppression[];
  }): Promise<FinanceReminderDryRun>;
  getAdminFinanceOperations(): Promise<AdminFinanceOperations>;
  recordSyncResult(input: {
    companyId: string;
    status: "running" | "failed" | "mapping_missing" | "locked";
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
    errorCode?: string;
    durationMs?: number;
  }): Promise<void>;
}
