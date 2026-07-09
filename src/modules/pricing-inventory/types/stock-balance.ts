export interface ProductStockBalance {
  id: string;
  productId: string;
  warehouseName: string;
  availableQuantity: number;
  reservedQuantity: number | null;
  updatedFrom1cAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
