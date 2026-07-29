import Decimal from "decimal.js";

import type {
  CommercialVisibilityContext,
  CompanyAccessService,
  PermissionService,
} from "../../access-control/services";
import { resolveCommercialVisibility } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryRepository, ProductStockTotal, ProductSupplierArrival, RetailPriceHistoryRange, RetailPriceHistoryRow, UsdMdlExchangeRate } from "../repositories";
import type { ProductPrice } from "../types";
import type { CommercialRate, CommercialRateSnapshot } from "../types";
import { normalizeOneCCurrencyCode } from "../../../lib/currency";
import { evaluateFreshness, type FreshnessView } from "../../integration/freshness";

export type ProductPriceViewDto = {
  currencyCode: string | null;
  amount: number;
  formattedAmount: string | null;
  lastUpdatedAt?: string;
};

export type ProductStockAvailability =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "expected"
  | "unknown";

export type ProductStockViewDto = {
  status: ProductStockAvailability;
  label: string;
  exactAvailableQuantity: number | null;
  exactPhysicalQuantity: number | null;
  exactReservedQuantity: number | null;
  exactIncomingQuantity: number | null;
  expectedArrival: {
    expectedQuantity: number | null;
    expectedDate: string | null;
    formattedExpectedDate?: string | null;
    sourceStatus: "confirmed_supply";
  } | null;
  hasVariantStock: boolean;
  lastUpdatedAt: string | null;
};

export type CommercialOpportunityViewDto = {
  reversePartnerUsd: number;
  reverseRetailUsd: number;
  grossProfitUsd: number | null;
  grossProfitMdl: number;
  markupPercent: number;
  formattedGrossProfit: string;
  formattedGrossProfitMdl: string;
  formattedMarkup: string;
};

export type ProductCommercialViewDto = {
  productId: string;
  partnerPrice: ProductPriceViewDto | null;
  partnerPriceMdl?: ProductPriceViewDto | null;
  msrpPriceUsd?: ProductPriceViewDto | null;
  retailPrice: ProductPriceViewDto | null;
  commercialOpportunity?: CommercialOpportunityViewDto | null;
  commercialRateFreshness?: FreshnessView | null;
  stock: ProductStockViewDto | null;
  isDemoData: boolean;
};

export type ProductCommercialInternalDto = ProductCommercialViewDto & { retailBelowPartnerPrice: boolean };
export type ProductCommercialSnapshot = {
  productId: string;
  canViewStock: boolean;
  partnerPrice: Pick<ProductPrice, "currency" | "currencyStatus" | "priceAmount" | "updatedAt"> | null;
  msrpPrice: Pick<ProductPrice, "currency" | "currencyStatus" | "priceAmount" | "updatedAt"> | null;
  stock: ProductStockTotal | null;
  supplierArrival: ProductSupplierArrival | null;
  partnerRate: { rate: number; publishedAt: string } | null;
  retailRate: { rate: number; publishedAt: string } | null;
};
export type ProductAvailabilityFilter = "in_stock" | "expected";
export type RetailPriceHistoryDto = RetailPriceHistoryRow & {
  formattedCurrent: string | null;
  formattedPrevious: string | null;
  formattedMinimum: string | null;
  formattedMaximum: string | null;
  formattedAbsoluteChange: string | null;
  formattedPercentageChange: string | null;
};

export interface PricingInventoryService {
  getCommercialVisibility?(userId: string): Promise<CommercialVisibilityContext>;
  listAvailableCurrencyCodes?(userId: string): Promise<string[]>;
  getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]>;
  getAuthoritativeProductCommercialViews?(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]>;
  getProductIdsByAvailability?(
    userId: string,
    availability: ProductAvailabilityFilter,
  ): Promise<string[]>;
  getApprovedUsdMdlRate?(userId: string): Promise<number | null>;
  getApprovedUsdMdlRateSnapshot?(userId: string): Promise<UsdMdlExchangeRate | null>;
  getRetailUsdMdlRateSnapshot?(
    userId: string,
  ): Promise<UsdMdlExchangeRate | null>;
  getRetailPriceHistory?(
    userId: string,
    productId: string,
    range: RetailPriceHistoryRange,
  ): Promise<RetailPriceHistoryDto>;
  getAuthoritativeUsdMdlRateSnapshot?(
    userId: string,
  ): Promise<UsdMdlExchangeRate | null>;
}

const STOCK_PERMISSION = "stock.view";
const LOW_STOCK_THRESHOLD = 5;
const ZERO_CHARACTERISTIC = "00000000-0000-0000-0000-000000000000";
export const MSRP_PRICE_TYPE_EXTERNAL_REF = "d9c92519-658b-11e8-80d3-000c29a58b59";

export class DefaultPricingInventoryService implements PricingInventoryService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async getCommercialVisibility(userId: string): Promise<CommercialVisibilityContext> {
    const company = await this.resolveActiveCompany(userId);
    const permissionContext =
      await this.permissionService.getEffectivePermissionContext(userId, company.id);
    return resolveCommercialVisibility(permissionContext);
  }

  async listAvailableCurrencyCodes(userId: string): Promise<string[]> {
    const company = await this.resolveActiveCompany(userId);
    const visibility = await this.getCommercialVisibility(userId);
    const canViewPrices =
      visibility.canViewPartnerPrice || visibility.canViewRetailPrice;
    if (!canViewPrices || !this.pricingInventoryRepository.listAvailableCurrencyCodes) return [];
    return this.pricingInventoryRepository.listAvailableCurrencyCodes(company.id);
  }

  async getProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]> {
    const normalizedProductIds = normalizeProductIds(productIds);

    if (normalizedProductIds.length === 0) {
      return [];
    }

    return this.loadProductCommercialViews(userId, normalizedProductIds, false);
  }

  async getAuthoritativeProductCommercialViews(
    userId: string,
    productIds: string[],
  ): Promise<ProductCommercialInternalDto[]> {
    const normalizedProductIds = normalizeProductIds(productIds);
    if (!normalizedProductIds.length) return [];
    return this.loadProductCommercialViews(userId, normalizedProductIds, true);
  }

  private async loadProductCommercialViews(
    userId: string,
    normalizedProductIds: string[],
    authoritativePartnerPricing: boolean,
  ): Promise<ProductCommercialInternalDto[]> {
    const company = await this.resolveActiveCompany(userId);
    const companyId = company.id;
    const [visibility, canViewStock] = await Promise.all([
      this.getCommercialVisibility(userId),
      this.permissionService.hasPermission(userId, companyId, STOCK_PERMISSION),
    ]);
    const canViewPartnerPrice =
      authoritativePartnerPricing || visibility.canViewPartnerPrice;
    const canViewRetailPrice = visibility.canViewRetailPrice;
    const [partnerPrices, msrpPrices, stockBalances, supplierArrivals, commercialRates] = await Promise.all([
      canViewPartnerPrice && company.external1cPriceTypeId
        ? (
          authoritativePartnerPricing
          && this.pricingInventoryRepository.listAuthoritativePricesForProducts
            ? this.pricingInventoryRepository.listAuthoritativePricesForProducts({
                productIds: normalizedProductIds,
                companyId,
                external1cPriceTypeId: company.external1cPriceTypeId,
              })
            : this.pricingInventoryRepository.listPricesForProducts({
            productIds: normalizedProductIds,
            companyId,
            external1cPriceTypeId: company.external1cPriceTypeId ?? undefined,
              })
        )
        : Promise.resolve<ProductPrice[]>([]),
      canViewRetailPrice
        ? this.pricingInventoryRepository.listPricesForProducts({ productIds: normalizedProductIds, companyId, external1cPriceTypeId: MSRP_PRICE_TYPE_EXTERNAL_REF })
        : Promise.resolve<ProductPrice[]>([]),
      canViewStock && this.pricingInventoryRepository.listStockTotalsForProducts
        ? this.pricingInventoryRepository.listStockTotalsForProducts(normalizedProductIds)
        : Promise.resolve<ProductStockTotal[]>([]),
      canViewStock && this.pricingInventoryRepository.listSupplierArrivalsForProducts
        ? this.pricingInventoryRepository.listSupplierArrivalsForProducts(normalizedProductIds)
        : Promise.resolve<ProductSupplierArrival[]>([]),
      (canViewPartnerPrice || canViewRetailPrice)
        && (
          authoritativePartnerPricing
            ? this.pricingInventoryRepository
                .getAuthoritativeCommercialRateSnapshot
            : this.pricingInventoryRepository.getActiveCommercialRateSnapshot
        )
        ? authoritativePartnerPricing
          ? this.pricingInventoryRepository
              .getAuthoritativeCommercialRateSnapshot!()
          : this.pricingInventoryRepository.getActiveCommercialRateSnapshot!()
        : Promise.resolve<CommercialRateSnapshot>({ partnerPriceUsdToMdl: null, retailPriceUsdToMdl: null }),
    ]);

    return normalizedProductIds.map((productId) => {
      const partnerPrice = canViewPartnerPrice
        ? selectPriceForProduct(partnerPrices, productId, companyId)
        : null;
      const msrpPrice = canViewRetailPrice
        ? selectPriceForProduct(msrpPrices, productId, companyId)
        : null;
      const stock = canViewStock
        ? stockAvailabilityForProduct(stockBalances, supplierArrivals, productId)
        : null;
      const demoView =
        !partnerPrice && !msrpPrice && !stock
          ? createDemoCommercialView(
              productId,
              canViewPartnerPrice,
              canViewRetailPrice,
              canViewStock,
            )
          : null;

      if (demoView) {
        return { ...demoView, retailBelowPartnerPrice: false };
      }

      const partnerPriceMdl = canViewPartnerPrice
        ? createPartnerPriceMdlView(
            partnerPrice,
            commercialRates.partnerPriceUsdToMdl,
          )
        : null;
      const msrpPriceUsd = createMsrpPriceUsdView(msrpPrice);
      const retailPrice = createRetailPriceMdlView(msrpPrice, commercialRates.retailPriceUsdToMdl);
      return {
        productId,
        partnerPrice: partnerPrice ? toPriceView(partnerPrice) : null,
        partnerPriceMdl,
        msrpPriceUsd,
        retailPrice,
        commercialOpportunity: canViewPartnerPrice
          ? createCommercialOpportunity(
              partnerPriceMdl,
              retailPrice,
              commercialRates.partnerPriceUsdToMdl,
              commercialRates.retailPriceUsdToMdl,
            )
          : null,
        commercialRateFreshness: createCommercialRateFreshness(commercialRates),
        stock,
        isDemoData: false,
        retailBelowPartnerPrice: canViewPartnerPrice
          && Boolean(partnerPriceMdl && retailPrice && retailPrice.amount < partnerPriceMdl.amount),
      };
    });
  }

  async getProductIdsByAvailability(
    userId: string,
    availability: ProductAvailabilityFilter,
  ): Promise<string[]> {
    const company = await this.resolveActiveCompany(userId);
    const canViewStock = await this.permissionService.hasPermission(
      userId,
      company.id,
      STOCK_PERMISSION,
    );
    if (!canViewStock) return [];

    if (availability === "in_stock") {
      return this.pricingInventoryRepository.listProductIdsWithPositiveStock?.() ?? [];
    }

    return this.pricingInventoryRepository.listProductIdsWithConfirmedArrival?.() ?? [];
  }

  async getRetailPriceHistory(
    userId: string,
    productId: string,
    range: RetailPriceHistoryRange,
  ): Promise<RetailPriceHistoryDto> {
    const company = await this.resolveActiveCompany(userId);
    const visibility = resolveCommercialVisibility(
      await this.permissionService.getEffectivePermissionContext(
        userId,
        company.id,
      ),
    );
    const canViewRetail = visibility.canViewRetailPrice
      && await this.permissionService.hasPermission(
        userId,
        company.id,
        "pricing.retail_price.view",
      );
    if (!canViewRetail || !this.pricingInventoryRepository.getRetailPriceHistory) {
      throw new Error("Retail price history is unavailable.");
    }
    const history = await this.pricingInventoryRepository.getRetailPriceHistory(
      productId,
      range,
    );
    const currentAmount = history.current?.amount ?? null;
    const currency = history.current?.currency ?? history.points.at(-1)?.currency ?? null;
    const change = currentAmount !== null && history.previousAmount !== null
      ? currentAmount - history.previousAmount
      : null;
    const percentage = change !== null && history.previousAmount !== null
      && history.previousAmount !== 0
      ? change / history.previousAmount * 100
      : null;
    return {
      ...history,
      formattedCurrent: formatRetailAmount(currentAmount, currency),
      formattedPrevious: formatRetailAmount(history.previousAmount, currency),
      formattedMinimum: formatRetailAmount(history.minimumAmount, currency),
      formattedMaximum: formatRetailAmount(history.maximumAmount, currency),
      formattedAbsoluteChange: formatRetailAmount(change, currency, true),
      formattedPercentageChange: percentage === null
        ? null
        : `${percentage > 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(percentage)}%`,
    };
  }

  async getApprovedUsdMdlRate(userId: string): Promise<number | null> {
    return (await this.getApprovedUsdMdlRateSnapshot(userId))?.mdlPerUsdRate ?? null;
  }

  async getApprovedUsdMdlRateSnapshot(userId: string): Promise<UsdMdlExchangeRate | null> {
    await this.resolveActiveCompany(userId);
    const canViewPrices = (await this.getCommercialVisibility(userId))
      .canViewPartnerPrice;
    if (
      !canViewPrices
      || !this.pricingInventoryRepository.getActiveCommercialRateSnapshot
    ) {
      return null;
    }

    const rate = (
      await this.pricingInventoryRepository.getActiveCommercialRateSnapshot()
    ).partnerPriceUsdToMdl;
    return rate && Number.isFinite(rate.rate) && rate.rate > 0
      ? {
          sourceCode: "113",
          mdlPerUsdRate: rate.rate,
          effectiveDate: rate.effectiveAt.slice(0, 10),
          publishedAt: rate.publishedAt,
        }
      : null;
  }

  async getRetailUsdMdlRateSnapshot(
    userId: string,
  ): Promise<UsdMdlExchangeRate | null> {
    const visibility = await this.getCommercialVisibility(userId);
    if (
      !visibility.canViewRetailPrice
      || !this.pricingInventoryRepository.getActiveCommercialRateSnapshot
    ) {
      return null;
    }
    const rate = (
      await this.pricingInventoryRepository.getActiveCommercialRateSnapshot()
    ).retailPriceUsdToMdl;
    return rate && Number.isFinite(rate.rate) && rate.rate > 0
      ? {
          sourceCode: "113",
          mdlPerUsdRate: rate.rate,
          effectiveDate: rate.effectiveAt.slice(0, 10),
          publishedAt: rate.publishedAt,
        }
      : null;
  }

  async getAuthoritativeUsdMdlRateSnapshot(
    userId: string,
  ): Promise<UsdMdlExchangeRate | null> {
    await this.resolveActiveCompany(userId);
    const snapshot =
      await this.pricingInventoryRepository
        .getAuthoritativeCommercialRateSnapshot?.();
    const rate = snapshot?.partnerPriceUsdToMdl;
    return rate && Number.isFinite(rate.rate) && rate.rate > 0
      ? {
          sourceCode: "113",
          mdlPerUsdRate: rate.rate,
          effectiveDate: rate.effectiveAt.slice(0, 10),
          publishedAt: rate.publishedAt,
        }
      : null;
  }

  private async resolveActiveCompany(userId: string): Promise<{ id: string; external1cPriceTypeId: string | null }> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
      return { id: "", external1cPriceTypeId: null };
    }

    const context = await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership.companyId,
    );

    return { id: activeMembership.companyId, external1cPriceTypeId: context.company.external1cPriceTypeId ?? null };
  }
}

export function projectProductCommercialSnapshot(
  snapshot: ProductCommercialSnapshot,
  visibility?: Pick<
    CommercialVisibilityContext,
    "canViewPartnerPrice" | "canViewRetailPrice"
  >,
): ProductCommercialInternalDto {
  const canViewPartnerPrice = visibility?.canViewPartnerPrice ?? true;
  const canViewRetailPrice = visibility?.canViewRetailPrice ?? true;
  const partnerPrice = canViewPartnerPrice && snapshot.partnerPrice
    ? snapshotPrice(snapshot.productId, null, snapshot.partnerPrice)
    : null;
  const msrpPrice = canViewRetailPrice && snapshot.msrpPrice
    ? snapshotPrice(snapshot.productId, MSRP_PRICE_TYPE_EXTERNAL_REF, snapshot.msrpPrice)
    : null;
  const commercialRates: CommercialRateSnapshot = {
    partnerPriceUsdToMdl: snapshotRate("partner_price_usd_to_mdl", snapshot.partnerRate),
    retailPriceUsdToMdl: snapshotRate("retail_price_usd_to_mdl", snapshot.retailRate),
  };
  const partnerPriceMdl = createPartnerPriceMdlView(partnerPrice, commercialRates.partnerPriceUsdToMdl);
  const retailPrice = createRetailPriceMdlView(msrpPrice, commercialRates.retailPriceUsdToMdl);

  return {
    productId: snapshot.productId,
    partnerPrice: partnerPrice ? toPriceView(partnerPrice) : null,
    partnerPriceMdl,
    msrpPriceUsd: createMsrpPriceUsdView(msrpPrice),
    retailPrice,
    commercialOpportunity: canViewPartnerPrice
      ? createCommercialOpportunity(
          partnerPriceMdl,
          retailPrice,
          commercialRates.partnerPriceUsdToMdl,
          commercialRates.retailPriceUsdToMdl,
        )
      : null,
    commercialRateFreshness: createCommercialRateFreshness(commercialRates),
    stock: snapshot.canViewStock
      ? stockAvailabilityForProduct(
          snapshot.stock ? [snapshot.stock] : [],
          snapshot.supplierArrival ? [snapshot.supplierArrival] : [],
          snapshot.productId,
        )
      : null,
    isDemoData: false,
    retailBelowPartnerPrice: Boolean(partnerPriceMdl && retailPrice && retailPrice.amount < partnerPriceMdl.amount),
  };
}

function snapshotPrice(
  productId: string,
  external1cPriceTypeId: string | null,
  value: NonNullable<ProductCommercialSnapshot["partnerPrice"]>,
): ProductPrice {
  return {
    id: "catalog-page-snapshot",
    productId,
    companyId: null,
    external1cPriceTypeId,
    currency: value.currency,
    currencyStatus: value.currencyStatus,
    priceAmount: value.priceAmount,
    validFrom: value.updatedAt,
    validTo: null,
    isActive: true,
    createdAt: value.updatedAt,
    updatedAt: value.updatedAt,
  };
}

function snapshotRate(
  purpose: CommercialRate["purpose"],
  value: ProductCommercialSnapshot["partnerRate"],
): CommercialRate | null {
  if (!value) return null;
  return {
    id: "catalog-page-snapshot",
    purpose,
    rate: value.rate,
    effectiveAt: value.publishedAt,
    publishedAt: value.publishedAt,
    publishedBy: "catalog-page-aggregate",
    publisherName: null,
    publisherEmail: null,
    sourceType: "manual_from_1c",
    sourceNote: "catalog-page-aggregate",
    evidenceComment: null,
    previousRateId: null,
    isActive: true,
  };
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

function selectPriceForProduct(
  prices: ProductPrice[],
  productId: string,
  companyId: string,
): ProductPrice | null {
  const currentTime = Date.now();
  const productPrices = prices
    .filter((price) => {
      if (price.productId !== productId || !price.isActive) {
        return false;
      }

      const validFrom = Date.parse(price.validFrom);
      const validTo = price.validTo ? Date.parse(price.validTo) : null;

      return (
        validFrom <= currentTime &&
        (validTo === null || validTo >= currentTime)
      );
    })
    .sort((left, right) => {
      const leftCompanyPriority = left.companyId === companyId ? 0 : 1;
      const rightCompanyPriority = right.companyId === companyId ? 0 : 1;

      if (leftCompanyPriority !== rightCompanyPriority) {
        return leftCompanyPriority - rightCompanyPriority;
      }

      return Date.parse(right.validFrom) - Date.parse(left.validFrom);
    });

  return productPrices[0] ?? null;
}

function toPriceView(price: ProductPrice): ProductPriceViewDto {
  const amount = price.priceAmount;
  const currencyCode = price.currencyStatus === "resolved" ? normalizeOneCCurrencyCode(price.currency) : null;

  return {
    currencyCode,
    amount,
    formattedAmount: currencyCode ? formatPrice(amount, currencyCode) : null,
    lastUpdatedAt: price.updatedAt,
  };
}

function formatPrice(amount: number, currencyCode: string): string {
  if (currencyCode === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currencyCode}`;
}

function createPartnerPriceMdlView(
  partnerPrice: ProductPrice | null,
  exchangeRate: CommercialRate | null,
): ProductPriceViewDto | null {
  if (!partnerPrice || partnerPrice.currencyStatus !== "resolved") return null;
  if (normalizeOneCCurrencyCode(partnerPrice.currency) !== "USD") return null;

  const amount = convertUsdToWholeMdl(partnerPrice.priceAmount, exchangeRate?.rate ?? null);
  if (amount === null) return null;

  return {
    currencyCode: "MDL",
    amount,
    formattedAmount: formatWholeMdl(amount),
    lastUpdatedAt: exchangeRate?.publishedAt,
  };
}

function convertUsdToWholeMdl(amount: number, mdlPerUsdRate: number | null): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(mdlPerUsdRate) || mdlPerUsdRate === null || mdlPerUsdRate <= 0) return null;
  return new Decimal(amount).times(mdlPerUsdRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function createMsrpPriceUsdView(msrpPrice: ProductPrice | null): ProductPriceViewDto | null {
  if (!msrpPrice || msrpPrice.external1cPriceTypeId !== MSRP_PRICE_TYPE_EXTERNAL_REF || !Number.isFinite(msrpPrice.priceAmount) || msrpPrice.priceAmount <= 0) return null;
  return {
    currencyCode: "USD",
    amount: msrpPrice.priceAmount,
    formattedAmount: formatPrice(msrpPrice.priceAmount, "USD"),
    lastUpdatedAt: msrpPrice.updatedAt,
  };
}

function createRetailPriceMdlView(
  msrpPrice: ProductPrice | null,
  exchangeRate: CommercialRate | null,
): ProductPriceViewDto | null {
  const source = createMsrpPriceUsdView(msrpPrice);
  if (!source) return null;
  const amount = convertUsdToWholeMdl(source.amount, exchangeRate?.rate ?? null);
  if (amount === null) return null;
  return {
    currencyCode: "MDL",
    amount,
    formattedAmount: formatWholeMdl(amount),
    lastUpdatedAt: exchangeRate?.publishedAt,
  };
}

function createCommercialOpportunity(
  partnerPriceMdl: ProductPriceViewDto | null,
  retailPriceMdl: ProductPriceViewDto | null,
  partnerRate: CommercialRate | null,
  retailRate: CommercialRate | null,
): CommercialOpportunityViewDto | null {
  if (!partnerPriceMdl || !retailPriceMdl || !partnerRate || !retailRate) return null;
  if (!Number.isFinite(partnerRate.rate) || partnerRate.rate <= 0 || !Number.isFinite(retailRate.rate) || retailRate.rate <= 0 || partnerPriceMdl.amount <= 0) return null;

  const displayedPartnerMdl = new Decimal(partnerPriceMdl.amount);
  const displayedRetailMdl = new Decimal(retailPriceMdl.amount);
  const grossProfitMdl = displayedRetailMdl.minus(displayedPartnerMdl);
  const reversePartnerUsd = displayedPartnerMdl.div(retailRate.rate);
  const reverseRetailUsd = displayedRetailMdl.div(partnerRate.rate);
  const markupPercent = calculateReverseMarkupPercent(reversePartnerUsd, reverseRetailUsd);
  const grossProfitUsd = reverseRetailUsd.minus(reversePartnerUsd);

  return {
    reversePartnerUsd: reversePartnerUsd.toNumber(),
    reverseRetailUsd: reverseRetailUsd.toNumber(),
    grossProfitUsd: grossProfitUsd.toNumber(),
    grossProfitMdl: grossProfitMdl.toNumber(),
    markupPercent: markupPercent.toNumber(),
    formattedGrossProfit: formatPrice(grossProfitUsd.toNumber(), "USD"),
    formattedGrossProfitMdl: formatWholeMdl(grossProfitMdl.toNumber()),
    formattedMarkup: new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(markupPercent.div(100).toNumber()),
  };
}

export function calculateReverseMarkupPercent(reversePartnerUsd: Decimal.Value, reverseRetailUsd: Decimal.Value): Decimal {
  const partner = new Decimal(reversePartnerUsd);
  const retail = new Decimal(reverseRetailUsd);
  if (!partner.isFinite() || !retail.isFinite() || partner.lte(0)) return new Decimal(NaN);
  return retail.div(partner).minus(1).times(100);
}

function formatWholeMdl(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(amount)} MDL`;
}

function createCommercialRateFreshness(rates: CommercialRateSnapshot): FreshnessView {
  const timestamps = [rates.partnerPriceUsdToMdl?.publishedAt, rates.retailPriceUsdToMdl?.publishedAt]
    .flatMap((value) => value && Number.isFinite(Date.parse(value)) ? [Date.parse(value)] : []);
  const oldestPublishedAt = timestamps.length === 2 ? new Date(Math.min(...timestamps)).toISOString() : null;
  return evaluateFreshness(oldestPublishedAt, "price", "Коммерческие курсы");
}

function stockAvailabilityForProduct(stockBalances: ProductStockTotal[], supplierArrivals:ProductSupplierArrival[], productId: string): ProductStockViewDto {
  const total = stockBalances.find((item) => item.productId === productId);
  if (!total) {
    const arrival=selectExpectedArrival(supplierArrivals,productId);
    if(arrival)return{status:"expected",label:expectedArrivalLabel(arrival.expectedDate),exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:0,expectedArrival:{expectedQuantity:arrival.expectedQuantity,expectedDate:arrival.expectedDate,formattedExpectedDate:formatArrivalDate(arrival.expectedDate),sourceStatus:"confirmed_supply"},hasVariantStock:false,lastUpdatedAt:arrival.publishedAt};
    return {
      status: "unknown",
      label: "\u041d\u0430\u043b\u0438\u0447\u0438\u0435 \u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f",
      exactAvailableQuantity: null,
      exactPhysicalQuantity: null,
      exactReservedQuantity: null,
      exactIncomingQuantity: null,
      expectedArrival: null,
      hasVariantStock: false,
      lastUpdatedAt: null,
    };
  }
  const arrival=selectExpectedArrival(supplierArrivals,productId);
  const common={exactAvailableQuantity:total.availableQuantity,exactPhysicalQuantity:total.physicalQuantity,exactReservedQuantity:total.reservedQuantity,exactIncomingQuantity:total.incomingQuantity,expectedArrival:arrival?{expectedQuantity:arrival.expectedQuantity,expectedDate:arrival.expectedDate,formattedExpectedDate:formatArrivalDate(arrival.expectedDate),sourceStatus:"confirmed_supply" as const}:null,hasVariantStock:total.hasVariantStock,lastUpdatedAt:total.syncedAt};
  if(total.availableQuantity===0){if(arrival)return{status:"expected",label:expectedArrivalLabel(arrival.expectedDate),...common};return{status:"out_of_stock",label:"\u041d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438",...common};}
  if(total.availableQuantity>LOW_STOCK_THRESHOLD)return{status:"in_stock",label:`В наличии: ${formatQuantity(total.availableQuantity)} шт.`,...common};
  if(total.availableQuantity>0)return{status:"low_stock",label:`Осталось: ${formatQuantity(total.availableQuantity)} шт.`,...common};
  if(total.incomingQuantity>0)return{status:"expected",label:"Ожидается",...common};
  if(total.hasVariantStock)return{status:"unknown",label:"Наличие по вариантам",...common};
  return{status:"out_of_stock",label:"Нет в наличии",...common};
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

function selectExpectedArrival(arrivals:ProductSupplierArrival[],productId:string){const valid=arrivals.filter(row=>row.productId===productId&&row.externalCharacteristicRef===ZERO_CHARACTERISTIC&&row.expectedQuantity>0).sort((a,b)=>a.expectedDate.localeCompare(b.expectedDate));const first=valid[0];if(!first)return null;return{expectedDate:first.expectedDate,expectedQuantity:valid.filter(row=>row.expectedDate===first.expectedDate).reduce((sum,row)=>sum+row.expectedQuantity,0),publishedAt:first.publishedAt};}
function expectedArrivalLabel(value:string){return `\u041e\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044f \u043a \u043f\u043e\u0441\u0442\u0443\u043f\u043b\u0435\u043d\u0438\u044e\n${formatArrivalDate(value)}`;}
function formatArrivalDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
function formatRetailAmount(
  amount: number | null,
  currency: string | null,
  signed = false,
): string | null {
  if (amount === null || !currency) return null;
  const value = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = signed && amount !== 0 ? (amount > 0 ? "+" : "−") : "";
  return `${sign}${value} ${currency}`;
}


type DemoCommercialViewSource = {
  partnerPrice: ProductPriceViewDto;
  stock: ProductStockViewDto;
};

const demoNow = "2026-07-09T00:00:00.000Z";

function createDemoCommercialView(
  productId: string,
  canViewPartnerPrice: boolean,
  canViewRetailPrice: boolean,
  canViewStock: boolean,
): ProductCommercialViewDto | null {
  const demoView = demoCommercialViews.get(productId);

  if (!demoView || (!canViewPartnerPrice && !canViewRetailPrice && !canViewStock)) {
    return null;
  }

  return {
    productId,
    partnerPrice: canViewPartnerPrice ? demoView.partnerPrice : null,
    partnerPriceMdl: null,
    msrpPriceUsd: null,
    retailPrice: null,
    commercialOpportunity: null,
    commercialRateFreshness: null,
    stock: canViewStock ? demoView.stock : null,
    isDemoData: true,
  };
}

const demoCommercialViews = new Map<string, DemoCommercialViewSource>([
  [
    "demo-product-dome-camera",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 100,
        formattedAmount: "100.00 BGN",
      },
      stock: {
        status: "in_stock",
        label: "Demo availability: In Stock: 24 available",
        exactAvailableQuantity: 24, exactPhysicalQuantity:24, exactReservedQuantity:0, exactIncomingQuantity:0, expectedArrival:null, hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
  [
    "demo-product-controller",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 150,
        formattedAmount: "150.00 BGN",
      },
      stock: {
        status: "low_stock",
        label: "Demo availability: Low Stock: 2 available",
        exactAvailableQuantity:2,exactPhysicalQuantity:2,exactReservedQuantity:0,exactIncomingQuantity:0,expectedArrival:null,hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
  [
    "demo-product-poe-switch",
    {
      partnerPrice: {
        currencyCode: "BGN",
        amount: 200,
        formattedAmount: "200.00 BGN",
      },
      stock: {
        status: "expected",
        label: "Demo availability: Expected: 10",
        exactAvailableQuantity:0,exactPhysicalQuantity:0,exactReservedQuantity:0,exactIncomingQuantity:10,expectedArrival:null,hasVariantStock:false,
        lastUpdatedAt: demoNow,
      },
    },
  ],
]);
