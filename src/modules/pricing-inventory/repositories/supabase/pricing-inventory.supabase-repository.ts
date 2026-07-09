import { createClient } from "@/src/lib/supabase/server";

import type {
  FindProductPriceInput,
  FindProductStockBalanceInput,
  ListProductPricesInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  UpsertProductPriceInput,
  UpsertProductStockBalanceInput,
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
  "id, product_id, warehouse_name, available_quantity, reserved_quantity, expected_quantity, expected_at, updated_from_1c_at, is_active, created_at, updated_at";

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

  async findProductPrice(
    input: FindProductPriceInput,
  ): Promise<ProductPrice | null> {
    const supabase = await createClient();
    let query = supabase
      .from("product_prices")
      .select(PRODUCT_PRICE_COLUMNS)
      .eq("product_id", input.productId)
      .eq("currency", input.currency)
      .eq("valid_from", input.validFrom);

    query = input.companyId
      ? query.eq("company_id", input.companyId)
      : query.is("company_id", null);
    query = input.external1cPriceTypeId
      ? query.eq("external_1c_price_type_id", input.external1cPriceTypeId)
      : query.is("external_1c_price_type_id", null);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return data ? mapProductPriceRow(data as ProductPriceRow) : null;
  }

  async upsertProductPrice(
    input: UpsertProductPriceInput,
  ): Promise<PricingUpsertResult<ProductPrice>> {
    const supabase = await createClient();
    const existing = await this.findProductPrice(input);
    const payload = {
      product_id: input.productId,
      company_id: input.companyId,
      external_1c_price_type_id: input.external1cPriceTypeId,
      currency: input.currency,
      price_amount: input.priceAmount,
      valid_from: input.validFrom,
      valid_to: input.validTo,
      is_active: input.isActive,
    };
    const query = existing
      ? supabase.from("product_prices").update(payload).eq("id", existing.id)
      : supabase.from("product_prices").insert(payload);
    const { data, error } = await query.select(PRODUCT_PRICE_COLUMNS).single();

    if (error || !data) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return {
      record: mapProductPriceRow(data as ProductPriceRow),
      created: !existing,
    };
  }

  async findProductStockBalance(
    input: FindProductStockBalanceInput,
  ): Promise<ProductStockBalance | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("product_stock_balances")
      .select(PRODUCT_STOCK_BALANCE_COLUMNS)
      .eq("product_id", input.productId)
      .eq("warehouse_name", input.warehouseName)
      .maybeSingle();

    if (error) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return data ? mapProductStockBalanceRow(data as ProductStockBalanceRow) : null;
  }

  async upsertProductStockBalance(
    input: UpsertProductStockBalanceInput,
  ): Promise<PricingUpsertResult<ProductStockBalance>> {
    const supabase = await createClient();
    const existing = await this.findProductStockBalance(input);
    const payload = {
      product_id: input.productId,
      warehouse_name: input.warehouseName,
      available_quantity: input.availableQuantity,
      reserved_quantity: input.reservedQuantity,
      expected_quantity: input.expectedQuantity,
      expected_at: input.expectedAt,
      updated_from_1c_at: input.updatedFrom1cAt,
      is_active: input.isActive,
    };
    const query = existing
      ? supabase
          .from("product_stock_balances")
          .update(payload)
          .eq("id", existing.id)
      : supabase.from("product_stock_balances").insert(payload);
    const { data, error } = await query
      .select(PRODUCT_STOCK_BALANCE_COLUMNS)
      .single();

    if (error || !data) {
      throw new PricingInventoryRepositoryUnexpectedError();
    }

    return {
      record: mapProductStockBalanceRow(data as ProductStockBalanceRow),
      created: !existing,
    };
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
