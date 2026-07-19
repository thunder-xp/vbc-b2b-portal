import { createHash } from "node:crypto";
import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import { isStale } from "../../integration/freshness";
import type { ProductCommercialViewDto, PricingInventoryService } from "../../pricing-inventory/services";
import type { CartRepository, PartnerOrderHistoryRepository } from "../repositories";
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

export type QuickReorderSelectionInput = { lineId: string; quantity: number };
export type QuickReorderConversionItemDto = {
  lineId: string;
  productName: string;
  sku: string;
  result: "added" | "updated" | "missing_price" | "unavailable" | "inactive" | "skipped" | "price_changed";
};
export type QuickReorderConversionResultDto = {
  cartId: string | null;
  repeated: boolean;
  added: number;
  updated: number;
  changedPrice: number;
  missingPrice: number;
  unavailable: number;
  inactive: number;
  skipped: number;
  items: QuickReorderConversionItemDto[];
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
    private readonly cartRepository?: CartRepository,
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

  async addSelectedToCart(userId: string, input: {
    orderId: string;
    requestKey: string;
    lines: QuickReorderSelectionInput[];
  }): Promise<QuickReorderConversionResultDto> {
    if (!this.cartRepository) throw new InvalidStateError("Quick reorder is unavailable.");
    const companyId = await this.resolveCompany(userId);
    const source = await this.historyRepository.getReorderSource(requirePortalUuid(input.orderId));
    if (!source || source.companyId !== companyId) throw new NotFoundError("Order was not found.");
    const requestKey = requirePortalUuid(input.requestKey);
    const selected = normalizeSelection(input.lines);
    if (!selected.length) throw new InvalidStateError("Select at least one order line.");
    const sourceByLine = new Map(source.lines.map((line) => [line.lineId, line]));
    if (selected.some((line) => !sourceByLine.has(line.lineId))) throw new NotFoundError("Order line was not found.");

    const productIds = [...new Set(selected.flatMap(({ lineId }) => sourceByLine.get(lineId)?.productId ?? []))];
    const commercialViews = await this.pricingInventoryService.getProductCommercialViews(userId, productIds);
    const commercialByProduct = new Map(commercialViews.map((view) => [view.productId, view]));
    const validItems: Array<{ lineId: string; quantity: number }> = [];
    const issues: QuickReorderConversionItemDto[] = [];
    let changedPrice = 0;

    for (const selection of selected) {
      const line = sourceByLine.get(selection.lineId)!;
      const identity = {
        productName: line.currentName ?? line.historicalProductName ?? "Товар из истории",
        sku: line.currentSku ?? line.historicalSku ?? "Без артикула",
      };
      if (!line.productExists || !line.productId || !line.currentIsVisible) {
        issues.push({ lineId: line.lineId, ...identity, result: "unavailable" });
        continue;
      }
      if (!line.currentIsActive) {
        issues.push({ lineId: line.lineId, ...identity, result: "inactive" });
        continue;
      }
      if (!isValidOneCReference(line.currentExternalProductRef)) {
        issues.push({ lineId: line.lineId, ...identity, result: "skipped" });
        continue;
      }
      const currentCommercial = commercialByProduct.get(line.productId);
      const currentPrice = currentCommercial?.isDemoData ? null : currentCommercial?.partnerPrice;
      if (!currentPrice) {
        issues.push({ lineId: line.lineId, ...identity, result: "missing_price" });
        continue;
      }
      if (isStale(currentPrice.lastUpdatedAt, "price")) {
        issues.push({ lineId: line.lineId, ...identity, result: "skipped" });
        continue;
      }
      const difference = comparePrices(line.historicalUnitPrice, line.historicalCurrencyCode, currentPrice.amount, currentPrice.currencyCode);
      if (difference.kind === "increased" || difference.kind === "decreased") changedPrice += 1;
      validItems.push(selection);
    }

    const summary = summarizeIssues(issues, changedPrice);
    if (!validItems.length) return { cartId: null, repeated: false, added: 0, updated: 0, ...summary, items: issues };
    const mutation = await this.cartRepository.mergeOrderReorderItems({
      orderId: source.orderId,
      requestKey,
      requestFingerprint: createRequestFingerprint(source.orderId, validItems),
      items: validItems,
      summary,
    });
    const added = new Set(mutation.addedProductIds);
    const updated = new Set(mutation.updatedProductIds);
    const successfulItems = validItems.map(({ lineId }) => {
      const line = sourceByLine.get(lineId)!;
      return {
        lineId,
        productName: line.currentName ?? line.historicalProductName ?? "Товар из истории",
        sku: line.currentSku ?? line.historicalSku ?? "Без артикула",
        result: added.has(line.productId!) ? "added" : updated.has(line.productId!) ? "updated" : "price_changed",
      } satisfies QuickReorderConversionItemDto;
    });
    return {
      cartId: mutation.cartId,
      repeated: mutation.repeated,
      added: mutation.addedProductIds.length,
      updated: mutation.updatedProductIds.length,
      ...summary,
      items: [...successfulItems, ...issues],
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

function normalizeSelection(lines: QuickReorderSelectionInput[]): QuickReorderSelectionInput[] {
  const result = new Map<string, number>();
  for (const line of lines) {
    const lineId = requirePortalUuid(line.lineId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999) throw new InvalidStateError("Quantity must be between 1 and 9999.");
    if (result.has(lineId)) throw new InvalidStateError("An order line was selected more than once.");
    result.set(lineId, line.quantity);
  }
  return [...result].map(([lineId, quantity]) => ({ lineId, quantity }));
}

function createRequestFingerprint(orderId: string, items: Array<{ lineId: string; quantity: number }>): string {
  const canonical = items.slice().sort((left, right) => left.lineId.localeCompare(right.lineId)).map((item) => `${item.lineId}:${item.quantity}`).join("|");
  return createHash("sha256").update(`${orderId}|${canonical}`).digest("hex");
}

function summarizeIssues(items: QuickReorderConversionItemDto[], changedPrice: number) {
  return {
    changedPrice,
    missingPrice: items.filter((item) => item.result === "missing_price").length,
    unavailable: items.filter((item) => item.result === "unavailable").length,
    inactive: items.filter((item) => item.result === "inactive").length,
    skipped: items.filter((item) => item.result === "skipped").length,
  };
}

function toPreviewLine(line: OrderReorderSourceLine, commercial?: ProductCommercialViewDto): QuickReorderPreviewLineDto {
  const currentPrice = commercial?.isDemoData ? null : commercial?.partnerPrice ?? null;
  const priceDifference = comparePrices(line.historicalUnitPrice, line.historicalCurrencyCode, currentPrice?.amount ?? null, currentPrice?.currencyCode ?? null);
  const status = classifyLine(line, commercial, priceDifference);
  const selectable = line.productExists && line.currentIsActive && line.currentIsVisible
    && isValidOneCReference(line.currentExternalProductRef) && Boolean(currentPrice)
    && !isStale(currentPrice?.lastUpdatedAt, "price");
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
  if (!commercial?.partnerPrice || commercial.isDemoData) return "missing_price";
  if (isStale(commercial.partnerPrice.lastUpdatedAt, "price")) return "review_required";
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
