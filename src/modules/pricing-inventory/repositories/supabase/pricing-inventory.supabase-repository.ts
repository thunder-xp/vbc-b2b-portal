import { createClient } from "@/src/lib/supabase/server";

import type {
  FindProductPriceInput,
  FindProductStockBalanceInput,
  ListProductPricesInput,
  PricingInventoryRepository,
  PricingUpsertResult,
  ProductStockTotal,
  ProductSupplierArrival,
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
  "id, product_id, company_id, external_1c_price_type_id, currency, currency_status, price_amount, valid_from, valid_to, is_active, created_at, updated_at";
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
  async getLatestUsdMdlExchangeRate() {
    const { data, error } = await (await createClient())
      .from("commercial_exchange_rates")
      .select("source_code,rate,effective_date,published_at")
      .eq("source_code", "113")
      .eq("base_currency", "USD")
      .eq("quote_currency", "MDL")
      .eq("rate_direction", "quote_per_base")
      .eq("is_published", true)
      .lte("effective_date", new Date().toISOString().slice(0, 10))
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new PricingInventoryRepositoryUnexpectedError();
    return data ? { sourceCode: "113" as const, mdlPerUsdRate: Number(data.rate), effectiveDate: data.effective_date, publishedAt: data.published_at } : null;
  }
  async listSupplierArrivalsForProducts(productIds:string[]):Promise<ProductSupplierArrival[]>{const ids=normalizeProductIds(productIds);if(!ids.length)return[];const{data,error}=await(await createClient()).from("product_supplier_arrivals").select("product_id,external_characteristic_ref,expected_arrival_date,expected_quantity,published_at").in("product_id",ids).eq("is_published",true).order("expected_arrival_date");if(error)throw new PricingInventoryRepositoryUnexpectedError();return(data??[]).map(row=>({productId:row.product_id,externalCharacteristicRef:row.external_characteristic_ref,expectedDate:row.expected_arrival_date,expectedQuantity:Number(row.expected_quantity),publishedAt:row.published_at}));}
  async listStockTotalsForProducts(productIds:string[]):Promise<ProductStockTotal[]>{const ids=normalizeProductIds(productIds);if(!ids.length)return[];const{data,error}=await(await createClient()).from("product_stock_totals").select("product_id,physical_quantity,reserved_quantity,available_quantity,incoming_quantity,has_variant_stock,synced_at").in("product_id",ids).eq("is_published",true);if(error)throw new PricingInventoryRepositoryUnexpectedError();return(data??[]).map(row=>({productId:row.product_id,physicalQuantity:Number(row.physical_quantity),reservedQuantity:Number(row.reserved_quantity),availableQuantity:Number(row.available_quantity),incomingQuantity:Number(row.incoming_quantity),hasVariantStock:row.has_variant_stock===true,syncedAt:row.synced_at}));}
  async upsertPriceType(input: { externalRef: string; externalCode: string; name: string; currencyCode: string | null; currencyStatus: "resolved" | "unresolved"; sourceUpdatedAt: string | null }): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("price_types").upsert({ external_ref: input.externalRef, external_code: input.externalCode, name: input.name, currency_code: input.currencyCode, currency_status: input.currencyStatus, source_updated_at: input.sourceUpdatedAt, is_active: true }, { onConflict: "external_ref" });
    if (error) throw new PricingInventoryRepositoryUnexpectedError();
  }
  async listPricesForProducts(
    input: ListProductPricesInput,
  ): Promise<ProductPrice[]> {
    const productIds = normalizeProductIds(input.productIds);

    if (productIds.length === 0) {
      return [];
    }

    const supabase = await createClient();
    const now = new Date().toISOString();
    let query = supabase
      .from("product_prices")
      .select(PRODUCT_PRICE_COLUMNS)
      .in("product_id", productIds)
      .eq("is_active", true)
      .eq("is_published", true)
      .lte("valid_from", now)
      .or(`valid_to.is.null,valid_to.gte.${now}`)
      .or(`company_id.is.null,company_id.eq.${input.companyId}`);
    if (input.external1cPriceTypeId) query = query.eq("external_1c_price_type_id", input.external1cPriceTypeId);
    const { data, error } = await query.order("valid_from", { ascending: false });

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
      .eq("product_id", input.productId);

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
      currency_status: input.currencyStatus ?? "unresolved",
      external_product_ref: input.externalProductRef ?? null,
      effective_at: input.validFrom,
      synced_at: new Date().toISOString(),
      source_version: input.sourceVersion ?? null,
      last_seen_sync_id: input.syncId ?? null,
      is_published: input.syncId ? false : true,
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

  async deactivateMissingProductPrices(syncId: string): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("finalize_product_price_snapshot", { p_sync_id: syncId });
    if (error) throw new PricingInventoryRepositoryUnexpectedError();
    return Number(data ?? 0);
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
