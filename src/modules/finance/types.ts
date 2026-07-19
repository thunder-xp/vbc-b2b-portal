export type ContractBalanceType = "receivable" | "advance";

export type PartnerContractBalance = {
  id: string;
  companyId: string;
  externalContractRef: string;
  contractNumber: string;
  contractName: string;
  currencyRef: string;
  currencyCode: string;
  signedBalance: string;
  sourceVersion: string | null;
  synchronizedAt: string;
};

export type ContractBalanceView = PartnerContractBalance & {
  balanceType: ContractBalanceType;
  absoluteDisplayAmount: string;
};

export type ContractBalanceCurrencySummary = {
  currencyCode: string;
  receivableTotal: string;
  advanceTotal: string;
};

export type FinanceOverview = {
  summaries: ContractBalanceCurrencySummary[];
  contracts: ContractBalanceView[];
  synchronizedAt: string | null;
  state: FinanceDataState;
  showLastConfirmedNotice: boolean;
};

export type FinanceSyncStatus = "running" | "succeeded" | "failed" | "mapping_missing";

export type FinanceSyncState = {
  companyId: string;
  status: FinanceSyncStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  receivedCount: number;
  publishedCount: number;
  excludedDeletedCount: number;
  sourceVersion: string | null;
  lastDurationMs: number | null;
};

export type FinanceDataState =
  | "never_synchronized"
  | "synchronized_nonzero"
  | "synchronized_zero"
  | "mapping_missing"
  | "failed_with_snapshot"
  | "failed_without_snapshot"
  | "stale";

export type FinanceSyncCompany = {
  companyId: string;
  companyName: string;
  counterpartyRef: string;
  activeBalanceCount: number;
};
