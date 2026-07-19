import type {
  ExternalReferenceDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  InvoiceDTO,
  ContractBalanceDTO,
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

export interface FinanceProvider {
  fetchContractBalances(
    input: ContractBalanceFetchRequestDTO,
  ): Promise<ContractBalanceFetchResultDTO>;
  fetchFinanceSnapshots(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>>;
  fetchInvoices(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<InvoiceDTO>>;
}
