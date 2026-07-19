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

export interface FinanceProvider {
  fetchContractBalances(
    input: ContractBalanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<ContractBalanceDTO>>;
  fetchFinanceSnapshots(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>>;
  fetchInvoices(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<InvoiceDTO>>;
}
