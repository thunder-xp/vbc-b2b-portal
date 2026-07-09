import { createClient } from "@/src/lib/supabase/server";

import type {
  ListProductPricesInput,
  PricingInventoryRepository,
} from "../pricing-inventory.repository";
import type { ProductPrice, ProductStockBalance } from "../../types";
import {
  mapProductPriceRow,
  mapProductStockBalanceRow,
  type ProductPriceRow,
  type ProductStockBalanceRow,
} from "./mappers";

const PRODUCT_PRICE_COLUMNS =
  "id, product_id, company_id, external_1c_price_type_id, currency, price_amount, valid_from, valid_to, is_active, created_at, updated_at";
const PRODUCT_STOCK_BALANCE_COLUMNS =
  "id, product_id, warehouse_name, available_quantity, reserved_quantity, updated_from_1c_at, is_active, created_at, updated_at";

export class PricingInventoryRepositoryUnexpectedError extends Error {
  constructor() {
    super("Pricing inventory repository operation failed.");
    this.name = "PricingInventoryRepositoryUnexpectedError";
  }
}

export class SupabasePricingInventoryRepository
  implements PricingInventoryRepository
{
  async listPricesForProducts(
    input: ListProductPricesInput,
  ): Promise<ProductPrice[]> {
    const productIds = normalizeProductIds(input.productIds);

    if (productIds.length === 0) {
      return [];
    }

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("product_prices")
      .select(PRODUCT_PRICE_COLUMNS)
      .in("product_id", productIds)
      .eq("is_active", true)
      .lte("valid_from", now)
      .or(`valid_to.is.null,valid_to.gte.${now}`)
      .or(`company_id.is.null,company_id.eq.${input.companyId}`)
      .order("valid_from", { ascending: false });

    if (error) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return (data as ProductPriceRow[]).map(mapProductPriceRow);
  }

  async listStockForProducts(
    productIds: string[],
  ): Promise<ProductStockBalance[]> {
    const normalizedProductIds = normalizeProductIds(productIds);

    if (normalizedProductIds.length === 0) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("product_stock_balances")
      .select(PRODUCT_STOCK_BALANCE_COLUMNS)
      .in("product_id", normalizedProductIds)
      .eq("is_active", true)
      .order("updated_from_1c_at", {
        ascending: false,
        nullsFirst: false,
      });

    if (error) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return (data as ProductStockBalanceRow[]).map(mapProductStockBalanceRow);
  }
}

function normalizeProductIds(productIds: string[]): string[] {
  return Array.from(
    new Set(
      productIds
        .map((productId) => productId.trim())
        .filter((productId) => productId.length > 0),
    ),
  );
}
