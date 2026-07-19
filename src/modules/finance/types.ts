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
};
