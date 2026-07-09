import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type StockBalanceDTO = {
  reference: ExternalReferenceDTO;
  productReference: ExternalReferenceDTO;
  warehouseReference: ExternalReferenceDTO | null;
  warehouseName: string;
  availableQuantity: number;
  reservedQuantity: number | null;
  expectedQuantity: number | null;
  expectedAt: string | null;
  sourceUpdatedAt: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};
