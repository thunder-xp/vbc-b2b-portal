import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { ProductCommercialViewDto, PricingInventoryService } from "../../pricing-inventory/services";
import type { PartnerOrderHistoryRepository } from "../repositories";
import type { OrderReorderSourceLine } from "../types";

export type QuickReorderLineStatus =
  | "available"
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
};

const STATUS_LABELS: Record<QuickReorderLineStatus, string> = {
  available: "Доступно",
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

    return {
      orderId: source.orderId,
      orderLabel: source.orderNumber ? `№ ${source.orderNumber}` : "Заказ из истории",
      lines: source.lines.map((line) => toPreviewLine(line, commercialByProduct.get(line.productId ?? ""))),
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
  const status = classifyLine(line, commercial);
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
      formatted: currentPrice.formattedAmount,
    } : null,
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

function classifyLine(line: OrderReorderSourceLine, commercial?: ProductCommercialViewDto): QuickReorderLineStatus {
  if (!line.productExists || !line.currentIsActive || !line.currentIsVisible) return "unavailable";
  if (!isValidOneCReference(line.currentExternalProductRef)) return "review_required";
  if (!commercial?.partnerPrice) return "missing_price";
  if ((commercial.stock?.exactAvailableQuantity ?? 0) <= 0) return "temporarily_unavailable";
  return "available";
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
