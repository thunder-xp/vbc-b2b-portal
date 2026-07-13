import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogProductCardDto, CatalogService } from "../../catalog/services";
import type {
  PricingInventoryService,
  ProductCommercialViewDto,
} from "../../pricing-inventory/services";
import type {
  ProjectSpecificationItemSnapshotInput,
  ProjectSpecificationRepository,
} from "../repositories";
import {
  ProjectSpecificationStatus,
  type ProjectSpecification,
  type ProjectSpecificationItem,
} from "../types";

export type ProjectSpecificationSummaryDto = {
  id: string;
  projectName: string;
  customerSiteName: string;
  status: ProjectSpecificationStatus;
  itemCount: number;
  submittedAt: string | null;
  updatedAt: string;
};

export type ProjectSpecificationLineDto = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  slug: string;
  quantity: number;
  partnerUnitPrice: string | null;
  retailUnitPrice: string | null;
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
  partnerLineTotal: string | null;
  retailLineTotal: string | null;
};

export type ProjectSpecificationTotalsDto = {
  partnerPurchaseTotal: string | null;
  retailTotal: string | null;
  potentialGrossProfit: string | null;
  markupPercentage: string | null;
};

export type ProjectSpecificationDetailDto = ProjectSpecificationSummaryDto & {
  description: string | null;
  revisionNumber: number;
  reviewComment: string | null;
  reviewedAt: string | null;
  revisionId: string | null;
  lines: ProjectSpecificationLineDto[];
  totals: ProjectSpecificationTotalsDto;
};

export type SaveProjectSpecificationInput = {
  projectName: string;
  customerSiteName: string;
  description?: string | null;
};

export interface ProjectSpecificationService {
  listOwnCompanySpecifications(userId: string): Promise<ProjectSpecificationSummaryDto[]>;
  createDraft(userId: string, input: SaveProjectSpecificationInput): Promise<ProjectSpecification>;
  getDetail(userId: string, specificationId: string): Promise<ProjectSpecificationDetailDto>;
  updateDraft(userId: string, specificationId: string, input: SaveProjectSpecificationInput): Promise<ProjectSpecification>;
  addItem(userId: string, specificationId: string, productId: string, quantity: number): Promise<void>;
  updateItemQuantity(userId: string, specificationId: string, itemId: string, quantity: number): Promise<void>;
  removeItem(userId: string, specificationId: string, itemId: string): Promise<void>;
  submit(userId: string, specificationId: string): Promise<ProjectSpecification>;
}

const SPECIFICATION_PERMISSION = "specifications.manage";
const MAX_QUANTITY = 9999;

export class DefaultProjectSpecificationService implements ProjectSpecificationService {
  constructor(
    private readonly repository: ProjectSpecificationRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async listOwnCompanySpecifications(userId: string): Promise<ProjectSpecificationSummaryDto[]> {
    const companyId = await this.resolveCompanyId(userId);
    const specifications = await this.repository.listByCompanyId(companyId);
    return Promise.all(specifications.map(async (specification) =>
      toSummary(specification, (await this.repository.listItems(specification.id)).length),
    ));
  }

  async createDraft(
    userId: string,
    input: SaveProjectSpecificationInput,
  ): Promise<ProjectSpecification> {
    const companyId = await this.resolveCompanyId(userId);
    const normalized = normalizeMetadata(input);
    return this.repository.create({ companyId, createdBy: userId, ...normalized });
  }

  async getDetail(userId: string, specificationId: string): Promise<ProjectSpecificationDetailDto> {
    const specification = await this.loadAccessibleSpecification(userId, specificationId);
    const items = await this.repository.listItems(specification.id);
    const revision = await this.repository.findRevisionByParentId(specification.id);
    if (specification.status !== ProjectSpecificationStatus.Draft) {
      return buildSubmittedSpecificationDetail(specification, items, revision?.id ?? null);
    }
    const presentation = await this.buildCurrentPresentation(userId, items);

    return {
      ...toSummary(specification, items.length),
      description: specification.description,
      revisionNumber: specification.revisionNumber,
      reviewComment: specification.reviewComment,
      reviewedAt: specification.reviewedAt,
      revisionId: revision?.id ?? null,
      lines: presentation.lines,
      totals: presentation.totals,
    };
  }

  async updateDraft(
    userId: string,
    specificationId: string,
    input: SaveProjectSpecificationInput,
  ): Promise<ProjectSpecification> {
    await this.ensureDraft(userId, specificationId);
    return this.repository.updateDraft({
      specificationId,
      ...normalizeMetadata(input),
    });
  }

  async addItem(
    userId: string,
    specificationId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await this.ensureDraft(userId, specificationId);
    const normalizedProductId = productId.trim();
    const normalizedQuantity = normalizeQuantity(quantity);
    const products = await this.catalogService.getProductsByIds(userId, [normalizedProductId]);
    if (!products.length) throw new NotFoundError("Catalog product was not found.");

    const items = await this.repository.listItems(specificationId);
    const existing = items.find((item) => item.productId === normalizedProductId);
    if (existing) {
      await this.repository.updateItemQuantity({
        itemId: existing.id,
        quantity: normalizeQuantity(existing.quantity + normalizedQuantity),
      });
      return;
    }
    await this.repository.addItem({ specificationId, productId: normalizedProductId, quantity: normalizedQuantity });
  }

  async updateItemQuantity(
    userId: string,
    specificationId: string,
    itemId: string,
    quantity: number,
  ): Promise<void> {
    await this.ensureDraft(userId, specificationId);
    const items = await this.repository.listItems(specificationId);
    if (!items.some((item) => item.id === itemId)) throw new NotFoundError("Specification item was not found.");
    await this.repository.updateItemQuantity({ itemId, quantity: normalizeQuantity(quantity) });
  }

  async removeItem(userId: string, specificationId: string, itemId: string): Promise<void> {
    await this.ensureDraft(userId, specificationId);
    const items = await this.repository.listItems(specificationId);
    if (!items.some((item) => item.id === itemId)) throw new NotFoundError("Specification item was not found.");
    await this.repository.removeItem(itemId);
  }

  async submit(userId: string, specificationId: string): Promise<ProjectSpecification> {
    await this.ensureDraft(userId, specificationId);
    const items = await this.repository.listItems(specificationId);
    if (items.length === 0) {
      throw new InvalidStateError("A specification requires at least one item.");
    }
    const snapshots = await this.buildSubmissionSnapshots(userId, items);
    return this.repository.submit(specificationId, snapshots);
  }

  private async buildCurrentPresentation(
    userId: string,
    items: Awaited<ReturnType<ProjectSpecificationRepository["listItems"]>>,
  ): Promise<{ lines: ProjectSpecificationLineDto[]; totals: ProjectSpecificationTotalsDto }> {
    const { productsById, commercialByProduct } = await this.loadCurrentValues(userId, items);
    return {
      lines: items.flatMap((item) => {
        const product = productsById.get(item.productId);
        return product ? [toLine(item.id, item.quantity, product, commercialByProduct.get(item.productId))] : [];
      }),
      totals: calculateTotals(items.map((item) => ({ quantity: item.quantity, commercial: commercialByProduct.get(item.productId) }))),
    };
  }

  private async buildSubmissionSnapshots(
    userId: string,
    items: Awaited<ReturnType<ProjectSpecificationRepository["listItems"]>>,
  ): Promise<ProjectSpecificationItemSnapshotInput[]> {
    const { productsById, commercialByProduct } = await this.loadCurrentValues(userId, items);
    return items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw new NotFoundError("Catalog product was not found.");
      const commercial = commercialByProduct.get(item.productId);
      return {
        itemId: item.id,
        productName: product.name,
        sku: product.sku,
        slug: product.slug,
        partnerUnitPriceAmount: commercial?.partnerPrice?.amount ?? null,
        partnerCurrencyCode: commercial?.partnerPrice?.currencyCode ?? null,
        retailUnitPriceAmount: commercial?.retailPrice?.amount ?? null,
        retailCurrencyCode: commercial?.retailPrice?.currencyCode ?? null,
        availableStock: commercial?.stock?.exactAvailableQuantity ?? null,
        nearestArrivalDate: commercial?.stock?.expectedArrival?.expectedDate ?? null,
        nearestArrivalQuantity: commercial?.stock?.expectedArrival?.expectedQuantity ?? null,
        grossProfitUsd: commercial?.commercialOpportunity?.grossProfitUsd ?? null,
        markupPercentage: commercial?.commercialOpportunity?.markupPercent ?? null,
      };
    });
  }

  private async loadCurrentValues(
    userId: string,
    items: Awaited<ReturnType<ProjectSpecificationRepository["listItems"]>>,
  ) {
    const productIds = items.map((item) => item.productId);
    const [products, commercialViews] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
    ]);
    return {
      productsById: new Map(products.map((product) => [product.id, product])),
      commercialByProduct: new Map(commercialViews.map((view) => [view.productId, view])),
    };
  }

  private async ensureDraft(userId: string, specificationId: string): Promise<ProjectSpecification> {
    const specification = await this.loadAccessibleSpecification(userId, specificationId);
    if (specification.status !== ProjectSpecificationStatus.Draft) {
      throw new InvalidStateError("Submitted specifications are read-only.");
    }
    return specification;
  }

  private async loadAccessibleSpecification(
    userId: string,
    specificationId: string,
  ): Promise<ProjectSpecification> {
    const companyId = await this.resolveCompanyId(userId);
    const specification = await this.repository.findById(specificationId.trim());
    if (!specification || specification.companyId !== companyId) {
      throw new NotFoundError("Project specification was not found.");
    }
    return specification;
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(
      userId,
      membership?.companyId ?? "",
    );
    await this.permissionService.ensurePermission(userId, context.company.id, SPECIFICATION_PERMISSION);
    return context.company.id;
  }
}

export function buildSubmittedSpecificationDetail(
  specification: ProjectSpecification,
  items: ProjectSpecificationItem[],
  revisionId: string | null,
): ProjectSpecificationDetailDto {
  const presentation = buildSnapshotPresentation(specification, items);
  return {
    ...toSummary(specification, items.length),
    description: specification.description,
    revisionNumber: specification.revisionNumber,
    reviewComment: specification.reviewComment,
    reviewedAt: specification.reviewedAt,
    revisionId,
    lines: presentation.lines,
    totals: presentation.totals,
  };
}

function normalizeMetadata(input: SaveProjectSpecificationInput) {
  const projectName = input.projectName.trim();
  const customerSiteName = input.customerSiteName.trim();
  const description = input.description?.trim() || null;
  if (!projectName || projectName.length > 200) throw new InvalidStateError("Project name is invalid.");
  if (!customerSiteName || customerSiteName.length > 200) throw new InvalidStateError("Customer or site name is invalid.");
  if (description && description.length > 2000) throw new InvalidStateError("Description is too long.");
  return { projectName, customerSiteName, description };
}

function normalizeQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new InvalidStateError("Quantity must be a whole number between 1 and 9999.");
  }
  return quantity;
}

function toSummary(specification: ProjectSpecification, itemCount: number): ProjectSpecificationSummaryDto {
  return {
    id: specification.id,
    projectName: specification.projectName,
    customerSiteName: specification.customerSiteName,
    status: specification.status,
    itemCount,
    submittedAt: specification.submittedAt,
    updatedAt: specification.updatedAt,
  };
}

function toLine(
  id: string,
  quantity: number,
  product: CatalogProductCardDto,
  commercial?: ProductCommercialViewDto,
): ProjectSpecificationLineDto {
  return {
    id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    slug: product.slug,
    quantity,
    partnerUnitPrice: commercial?.partnerPrice?.formattedAmount ?? null,
    retailUnitPrice: commercial?.retailPrice?.formattedAmount ?? null,
    availableStock: commercial?.stock?.exactAvailableQuantity ?? null,
    nearestArrivalDate: commercial?.stock?.expectedArrival?.formattedExpectedDate ?? null,
    nearestArrivalQuantity: commercial?.stock?.expectedArrival?.expectedQuantity ?? null,
    partnerLineTotal: formatTotal(commercial?.partnerPrice, quantity),
    retailLineTotal: formatTotal(commercial?.retailPrice, quantity),
  };
}

function buildSnapshotPresentation(
  specification: ProjectSpecification,
  items: Awaited<ReturnType<ProjectSpecificationRepository["listItems"]>>,
): { lines: ProjectSpecificationLineDto[]; totals: ProjectSpecificationTotalsDto } {
  const lines = items.flatMap((item) => {
    if (!item.productNameSnapshot || !item.skuSnapshot || !item.slugSnapshot) return [];
    return [{
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      sku: item.skuSnapshot,
      slug: item.slugSnapshot,
      quantity: item.quantity,
      partnerUnitPrice: formatOptionalMoney(item.partnerUnitPriceAmount, item.partnerCurrencyCode),
      retailUnitPrice: formatOptionalMoney(item.retailUnitPriceAmount, item.retailCurrencyCode),
      availableStock: item.availableStock,
      nearestArrivalDate: item.nearestArrivalDate ? formatDate(item.nearestArrivalDate) : null,
      nearestArrivalQuantity: item.nearestArrivalQuantity,
      partnerLineTotal: formatOptionalMoney(item.partnerLineTotalAmount, item.partnerCurrencyCode),
      retailLineTotal: formatOptionalMoney(item.retailLineTotalAmount, item.retailCurrencyCode),
    }];
  });
  return { lines, totals: calculateSnapshotTotals(specification) };
}

function calculateSnapshotTotals(
  specification: ProjectSpecification,
): ProjectSpecificationTotalsDto {
  return {
    partnerPurchaseTotal: formatOptionalMoney(
      specification.partnerPurchaseTotalAmount,
      specification.partnerCurrencyCodeSnapshot,
    ),
    retailTotal: formatOptionalMoney(
      specification.retailTotalAmount,
      specification.retailCurrencyCodeSnapshot,
    ),
    potentialGrossProfit: specification.grossProfitUsdSnapshot === null
      ? null
      : formatMoney(specification.grossProfitUsdSnapshot, "USD"),
    markupPercentage: specification.markupPercentageSnapshot === null
      ? null
      : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(specification.markupPercentageSnapshot)}%`,
  };
}

function formatOptionalMoney(amount: number | null, currency: string | null): string | null {
  return amount !== null && currency ? formatMoney(amount, currency) : null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function formatTotal(
  price: { amount: number; currencyCode: string | null } | null | undefined,
  quantity: number,
): string | null {
  return price?.currencyCode ? formatMoney(price.amount * quantity, price.currencyCode) : null;
}

function calculateTotals(
  lines: Array<{ quantity: number; commercial?: ProductCommercialViewDto }>,
): ProjectSpecificationTotalsDto {
  const priced = lines.filter((line) => line.commercial?.partnerPrice && line.commercial.retailPrice);
  if (!lines.length || priced.length !== lines.length) return emptyTotals();

  const partnerCurrency = commonCurrency(priced.map((line) => line.commercial?.partnerPrice?.currencyCode));
  const retailCurrency = commonCurrency(priced.map((line) => line.commercial?.retailPrice?.currencyCode));
  const partnerTotal = priced.reduce((sum, line) => sum + (line.commercial?.partnerPrice?.amount ?? 0) * line.quantity, 0);
  const retailTotal = priced.reduce((sum, line) => sum + (line.commercial?.retailPrice?.amount ?? 0) * line.quantity, 0);
  const opportunityLines = priced.filter((line) => line.commercial?.commercialOpportunity);
  const grossProfit = opportunityLines.reduce(
    (sum, line) => sum + (line.commercial?.commercialOpportunity?.grossProfitUsd ?? 0) * line.quantity,
    0,
  );
  const opportunityPartnerTotal = opportunityLines.reduce(
    (sum, line) => sum + (line.commercial?.partnerPrice?.amount ?? 0) * line.quantity,
    0,
  );

  return {
    partnerPurchaseTotal: partnerCurrency ? formatMoney(partnerTotal, partnerCurrency) : null,
    retailTotal: retailCurrency ? formatMoney(retailTotal, retailCurrency) : null,
    potentialGrossProfit: opportunityLines.length ? formatMoney(grossProfit, "USD") : null,
    markupPercentage: opportunityPartnerTotal > 0
      ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format((grossProfit / opportunityPartnerTotal) * 100)}%`
      : null,
  };
}

function commonCurrency(values: Array<string | null | undefined>): string | null {
  const currencies = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return currencies.length === 1 ? currencies[0] : null;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function emptyTotals(): ProjectSpecificationTotalsDto {
  return {
    partnerPurchaseTotal: null,
    retailTotal: null,
    potentialGrossProfit: null,
    markupPercentage: null,
  };
}
