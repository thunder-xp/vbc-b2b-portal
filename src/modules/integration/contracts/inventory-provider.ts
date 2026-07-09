import type {
  ExternalReferenceDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  StockBalanceDTO,
} from "../dto";

export type StockBalanceFetchRequestDTO = IntegrationSyncWindowDTO & {
  productReferences?: ExternalReferenceDTO[];
  warehouseReferences?: ExternalReferenceDTO[];
};

export interface InventoryProvider {
  fetchStockBalances(
    input: StockBalanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<StockBalanceDTO>>;
}
