import { InvalidStateError } from "../../access-control/services";
import type { CatalogService } from "../../catalog/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { PricingInventoryService, ProductCommercialViewDto } from "../../pricing-inventory";
import type { WarehouseArrivalRepository } from "../repositories";
import type { WarehouseArrivalDetail, WarehouseArrivalFilters, WarehouseArrivalPage, WarehouseArrivalPageData, WarehouseReplenishmentPageData } from "../types";

export class WarehouseArrivalService {
  constructor(
    private readonly repository: WarehouseArrivalRepository,
    private readonly workspaceContext: PartnerWorkspaceContextService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingInventoryService,
  ) {}

  async list(userId: string, input: WarehouseArrivalFilters = {}): Promise<WarehouseArrivalPage> {
    const companyId = await this.companyId(userId);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const result = await this.repository.list(companyId, {
      ...input,
      availability: input.availability ?? "all",
      unseenOnly: input.unseenOnly ?? false,
      pageSize,
      offset: (page - 1) * pageSize,
    });
    return { ...result, page, totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)) };
  }

  async get(userId: string, arrivalId: string): Promise<WarehouseArrivalDetail | null> {
    return (await this.getPageData(userId, arrivalId))?.arrival ?? null;
  }

  async getPageData(userId: string, arrivalId: string): Promise<WarehouseArrivalPageData | null> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    const companyId = this.activeCompanyId(context.accessState, context.companyId);
    const arrival = await this.repository.get(companyId, arrivalId);
    if (!arrival) return null;
    const [products, commercialViews] = await Promise.all([
      this.catalog.getProductsByIds(userId, arrival.productIds),
      this.pricing.getProductCommercialViews(userId, arrival.productIds),
    ]);
    return {
      arrival: { ...arrival, products, commercialViews },
      companyId,
      userId: context.userId,
      productCardCapabilities: context.capabilities.productCard,
    };
  }

  async markSeen(userId: string, arrivalId: string): Promise<void> {
    await this.repository.markSeen(await this.companyId(userId), arrivalId);
  }

  async getCurrentReplenishment(userId: string): Promise<WarehouseReplenishmentPageData> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    const companyId = this.activeCompanyId(context.accessState, context.companyId);
    const candidates = await this.repository.getCurrentReplenishment(companyId);
    const productIds = candidates.map((item) => item.productId);
    const [products, commercialViews] = await Promise.all([
      this.catalog.getProductsByIds(userId, productIds),
      this.pricing.getProductCommercialViews(userId, productIds),
    ]);
    const sourceOrder = new Map(candidates.map((item) => [item.productId, item.sourceLineNumber]));
    const commercialByProduct = new Map(commercialViews.map((view) => [view.productId, view]));
    const orderedProducts = products.toSorted((left, right) => {
      const stockDifference = stockRank(commercialByProduct.get(left.id)) - stockRank(commercialByProduct.get(right.id));
      return stockDifference || (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
    });
    return {
      products: orderedProducts,
      commercialViews,
      companyId,
      userId: context.userId,
      productCardCapabilities: context.capabilities.productCard,
    };
  }

  private async companyId(userId: string) {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    return this.activeCompanyId(context.accessState, context.companyId);
  }

  private activeCompanyId(accessState: string, companyId: string | null) {
    if (accessState !== "active" || !companyId) {
      throw new InvalidStateError("Partner catalog access is not active.");
    }
    return companyId;
  }
}

function stockRank(view: ProductCommercialViewDto | undefined): number {
  return view?.stock?.status === "in_stock" || view?.stock?.status === "low_stock" ? 0 : 1;
}
