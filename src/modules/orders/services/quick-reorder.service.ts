import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { ProductCommercialViewDto, PricingInventoryService } from "../../pricing-inventory/services";
import type { PartnerOrderHistoryRepository } from "../repositories";
import type { OrderReorderSourceLine } from "../types";

export type QuickReorderLineStatus =
  | "available"
  | "price_changed"
  | "missing_price"
  | "temporarily_unavailable"
  | "unavailable"
  | "review_required";

export type QuickReorderPreviewLineDto = {
  lineId: string;
  productId: string | null;
  imageUrl: string | null;
  sku: string;
  productName: string;
  historicalQuantity: number;
  historicalUnitPrice: { amount: number; currencyCode: string | null; formatted: string };
  currentUnitPrice: { amount: number; currencyCode: string | null; formatted: string | null } | null;
  priceDifference: QuickReorderPriceDifferenceDto;
  availableStock: number | null;
  expectedArrival: { date: string | null; quantity: number | null; formattedDate: string | null } | null;
  status: QuickReorderLineStatus;
  statusLabel: string;
  canSelect: boolean;
  selectedByDefault: boolean;
  replacementHref: string | null;
};

export type QuickReorderPreviewDto = {
  orderId: string;
  orderLabel: string;
  lines: QuickReorderPreviewLineDto[];
  commercialSummary: {
    unchanged: number;
    increased: number;
    decreased: number;
    unavailable: number;
  };
};

export type QuickReorderPriceDifferenceDto = {
  kind: "unchanged" | "increased" | "decreased" | "unavailable";
  label: string;
  absoluteDifference: number | null;
  percentageDifference: number | null;
  formattedAbsoluteDifference: string | null;
  formattedPercentageDifference: string | null;
};

const STATUS_LABELS: Record<QuickReorderLineStatus, string> = {
  available: "Доступно",
  price_changed: "Цена изменилась",
  missing_price: "Нет текущей цены",
  temporarily_unavailable: "Товар временно отсутствует",
  unavailable: "Товар больше недоступен",
  review_required: "Требуется проверка",
};

export class QuickReorderService {
  constructor(
    private readonly historyRepository: PartnerOrderHistoryRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async preview(userId: string, orderId: string): Promise<QuickReorderPreviewDto> {
    const companyId = await this.resolveCompany(userId);
    const source = await this.historyRepository.getReorderSource(requirePortalUuid(orderId));
    if (!source || source.companyId !== companyId) throw new NotFoundError("Order was not found.");

    const productIds = [...new Set(source.lines.flatMap((line) => line.productId ? [line.productId] : []))];
    const commercialViews = await this.pricingInventoryService.getProductCommercialViews(userId, productIds);
    const commercialByProduct = new Map(commercialViews.map((view) => [view.productId, view]));

    const lines = source.lines.map((line) => toPreviewLine(line, commercialByProduct.get(line.productId ?? "")));
    return {
      orderId: source.orderId,
      orderLabel: source.orderNumber ? `№ ${source.orderNumber}` : "Заказ из истории",
      lines,
      commercialSummary: {
        unchanged: lines.filter((line) => line.priceDifference.kind === "unchanged").length,
        increased: lines.filter((line) => line.priceDifference.kind === "increased").length,
        decreased: lines.filter((line) => line.priceDifference.kind === "decreased").length,
        unavailable: lines.filter((line) => line.priceDifference.kind === "unavailable").length,
      },
    };
  }

  private async resolveCompany(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await Promise.all([
      this.permissionService.ensurePermission(userId, context.company.id, "orders.view"),
      this.permissionService.ensurePermission(userId, context.company.id, "cart.manage"),
    ]);
    return context.company.id;
  }
}

function toPreviewLine(line: OrderReorderSourceLine, commercial?: ProductCommercialViewDto): QuickReorderPreviewLineDto {
  const currentPrice = commercial?.partnerPrice ?? null;
  const priceDifference = comparePrices(line.historicalUnitPrice, line.historicalCurrencyCode, currentPrice?.amount ?? null, currentPrice?.currencyCode ?? null);
  const status = classifyLine(line, commercial, priceDifference);
  const selectable = line.productExists && line.currentIsActive && line.currentIsVisible && isValidOneCReference(line.currentExternalProductRef) && Boolean(currentPrice);
  return {
    lineId: line.lineId,
    productId: line.productId,
    imageUrl: line.currentImageUrl,
    sku: line.currentSku ?? line.historicalSku ?? "Без артикула",
    productName: line.currentName ?? line.historicalProductName ?? "Товар из истории",
    historicalQuantity: line.historicalQuantity,
    historicalUnitPrice: {
      amount: line.historicalUnitPrice,
      currencyCode: line.historicalCurrencyCode,
      formatted: formatMoney(line.historicalUnitPrice, line.historicalCurrencyCode),
    },
    currentUnitPrice: currentPrice ? {
      amount: currentPrice.amount,
      currencyCode: currentPrice.currencyCode,
      formatted: currentPrice.formattedAmount ?? formatMoney(currentPrice.amount, currentPrice.currencyCode),
    } : null,
    priceDifference,
    availableStock: commercial?.stock?.exactAvailableQuantity ?? null,
    expectedArrival: commercial?.stock?.expectedArrival ? {
      date: commercial.stock.expectedArrival.expectedDate,
      quantity: commercial.stock.expectedArrival.expectedQuantity,
      formattedDate: commercial.stock.expectedArrival.formattedExpectedDate ?? null,
    } : null,
    status,
    statusLabel: STATUS_LABELS[status],
    canSelect: selectable,
    selectedByDefault: selectable,
    replacementHref: line.currentCategoryId ? `/cabinet/catalog?category=${encodeURIComponent(line.currentCategoryId)}` : "/cabinet/catalog",
  };
}

function classifyLine(line: OrderReorderSourceLine, commercial: ProductCommercialViewDto | undefined, difference: QuickReorderPriceDifferenceDto): QuickReorderLineStatus {
  if (!line.productExists || !line.currentIsActive || !line.currentIsVisible) return "unavailable";
  if (!isValidOneCReference(line.currentExternalProductRef)) return "review_required";
  if (!commercial?.partnerPrice) return "missing_price";
  if ((commercial.stock?.exactAvailableQuantity ?? 0) <= 0) return "temporarily_unavailable";
  if (difference.kind === "increased" || difference.kind === "decreased") return "price_changed";
  return "available";
}

export function compareQuickReorderPrices(
  historicalAmount: number,
  historicalCurrency: string | null,
  currentAmount: number | null,
  currentCurrency: string | null,
): QuickReorderPriceDifferenceDto {
  return comparePrices(historicalAmount, historicalCurrency, currentAmount, currentCurrency);
}

function comparePrices(
  historicalAmount: number,
  historicalCurrency: string | null,
  currentAmount: number | null,
  currentCurrency: string | null,
): QuickReorderPriceDifferenceDto {
  const historicalCode = historicalCurrency?.trim().toUpperCase() ?? "";
  const currentCode = currentCurrency?.trim().toUpperCase() ?? "";
  if (!Number.isFinite(historicalAmount) || historicalAmount <= 0 || currentAmount === null || !Number.isFinite(currentAmount)
    || currentAmount <= 0 || !historicalCode || !currentCode || historicalCode !== currentCode) {
    return {
      kind: "unavailable",
      label: currentAmount === null ? "Текущая цена недоступна" : "Сравнение цены недоступно",
      absoluteDifference: null,
      percentageDifference: null,
      formattedAbsoluteDifference: null,
      formattedPercentageDifference: null,
    };
  }
  const historical = new Decimal(historicalAmount);
  const difference = new Decimal(currentAmount).minus(historical);
  const absolute = difference.abs().toDecimalPlaces(4).toNumber();
  const percentage = difference.dividedBy(historical).times(100).toDecimalPlaces(2).toNumber();
  const kind = difference.isZero() ? "unchanged" : difference.isPositive() ? "increased" : "decreased";
  return {
    kind,
    label: kind === "unchanged" ? "Цена не изменилась" : kind === "increased" ? "Цена выросла" : "Цена снизилась",
    absoluteDifference: difference.toDecimalPlaces(4).toNumber(),
    percentageDifference: percentage,
    formattedAbsoluteDifference: kind === "unchanged" ? formatMoney(0, currentCode) : `${difference.isPositive() ? "+" : "−"}${formatMoney(absolute, currentCode)}`,
    formattedPercentageDifference: `${percentage > 0 ? "+" : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(percentage)}%`,
  };
}

function isValidOneCReference(value: string | null): boolean {
  const normalized = value?.trim() ?? "";
  return normalized !== "00000000-0000-0000-0000-000000000000"
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(normalized);
}

function requirePortalUuid(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new NotFoundError("Order was not found.");
  }
  return normalized.toLowerCase();
}

function formatMoney(amount: number, currencyCode: string | null): string {
  if (!currencyCode) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} · валюта уточняется`;
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} ${currencyCode}`;
  }
}
import Decimal from "decimal.js";
