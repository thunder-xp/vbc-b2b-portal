import type {
  ExternalReferenceDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  InvoiceDTO,
} from "../dto";

export type FinanceFetchRequestDTO = IntegrationSyncWindowDTO & {
  partnerCompanyReferences?: ExternalReferenceDTO[];
};

export interface FinanceProvider {
  fetchFinanceSnapshots(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>>;
  fetchInvoices(
    input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<InvoiceDTO>>;
}
