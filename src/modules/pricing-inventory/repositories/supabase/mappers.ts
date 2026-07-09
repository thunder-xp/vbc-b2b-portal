import type { ProductPrice, ProductStockBalance } from "../../types";

export interface ProductPriceRow {
  id: string;
  product_id: string;
  company_id: string | null;
  external_1c_price_type_id: string | null;
  currency: string;
  price_amount: number | string;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductStockBalanceRow {
  id: string;
  product_id: string;
  warehouse_name: string;
  available_quantity: number | string;
  reserved_quantity: number | string | null;
  expected_quantity: number | string | null;
  expected_at: string | null;
  updated_from_1c_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function mapProductPriceRow(row: ProductPriceRow): ProductPrice {
  return {
    id: row.id,
    productId: row.product_id,
    companyId: row.company_id,
    external1cPriceTypeId: row.external_1c_price_type_id,
    currency: row.currency,
    priceAmount: Number(row.price_amount),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProductStockBalanceRow(
  row: ProductStockBalanceRow,
): ProductStockBalance {
  return {
    id: row.id,
    productId: row.product_id,
    warehouseName: row.warehouse_name,
    availableQuantity: Number(row.available_quantity),
    reservedQuantity:
      row.reserved_quantity === null ? null : Number(row.reserved_quantity),
    expectedQuantity:
      row.expected_quantity === null ? null : Number(row.expected_quantity),
    expectedAt: row.expected_at,
    updatedFrom1cAt: row.updated_from_1c_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
