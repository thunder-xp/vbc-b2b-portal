import type {
  ExternalReferenceDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  InvoiceDTO,
  ContractBalanceDTO,
  PaymentObligationSourceDTO,
} from "../dto";

export type FinanceFetchRequestDTO = IntegrationSyncWindowDTO & {
  partnerCompanyReferences?: ExternalReferenceDTO[];
};

export type ContractBalanceFetchRequestDTO = {
  counterpartyReference: ExternalReferenceDTO;
  organizationReference: ExternalReferenceDTO;
  synchronizedAt: string;
};

export type ContractBalanceFetchDiagnosticsDTO = {
  rawBalanceCount: number;
  zeroBalanceCount: number;
  invalidBalanceCount: number;
  missingContractCount: number;
  deletedContractCount: number;
  inactiveContractCount: number;
  wrongCounterpartyCount: number;
  wrongOrganizationCount: number;
  wrongContractTypeCount: number;
  missingCurrencyCount: number;
  deletedCurrencyCount: number;
  oneCCallCount: number;
};

export type ContractBalanceFetchResultDTO = IntegrationPageResultDTO<ContractBalanceDTO> & {
  diagnostics?: ContractBalanceFetchDiagnosticsDTO;
};

export type PaymentObligationFetchRequestDTO = ContractBalanceFetchRequestDTO & {
  observationStartDate?: string;
};

export type PaymentObligationFetchDiagnosticsDTO = {
  ordersReceived: number;
  paymentCalendarOrders: number;
  emptyCalendarOrders: number;
  bankPaymentsReceived: number;
  cashPaymentsReceived: number;
  balanceRowsReceived: number;
  oneCCallCount: number;
};

export type PaymentObligationFetchResultDTO = IntegrationPageResultDTO<PaymentObligationSourceDTO> & {
  diagnostics: PaymentObligationFetchDiagnosticsDTO;
};

export interface FinanceProvider {
  fetchContractBalances(
    input: ContractBalanceFetchRequestDTO,
  ): Promise<ContractBalanceFetchResultDTO>;
  fetchPaymentObligations(
    input: PaymentObligationFetchRequestDTO,
  ): Promise<PaymentObligationFetchResultDTO>;
  fetchFinanceSnapshots(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>>;
  fetchInvoices(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<InvoiceDTO>>;
}
