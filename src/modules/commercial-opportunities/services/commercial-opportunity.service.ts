import { InvalidStateError } from "../../access-control/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { ProductReferenceService } from "../../catalog/services";
import type { CommercialOpportunityRepository } from "../repositories";
import type { CommercialOpportunityFilter, CommercialOpportunityPage } from "../types";

export class CommercialOpportunityService {
  constructor(
    private readonly repository: CommercialOpportunityRepository,
    private readonly workspaceContext: PartnerWorkspaceContextService,
    private readonly productReferences?: ProductReferenceService,
  ) {}

  async list(userId: string, input: { filter?: CommercialOpportunityFilter; page?: number; pageSize?: number } = {}): Promise<CommercialOpportunityPage & { page: number; totalPages: number }> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) throw new InvalidStateError("Partner workspace access is not active.");
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 24)));
    const result = await this.repository.list({
      companyId: context.companyId,
      filter: input.filter ?? "all",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const productIds = result.items.flatMap((item) => item.product ? [item.product.id] : []);
    const references = this.productReferences && productIds.length
      ? await this.productReferences.getProductReferencesByIds(userId, productIds)
      : [];
    const byProduct = new Map(references.map((reference) => [reference.productId, reference]));
    const items = result.items.map((item) => {
      if (!item.product) return item;
      const reference = byProduct.get(item.product.id);
      return reference ? {
        ...item,
        product: {
          ...item.product,
          reference,
          imageUrl: reference.thumbnail,
          thumbnailFit: reference.thumbnailFit,
        },
      } : item;
    });
    console.info({
      event: "opportunity_product_image_enrichment_completed",
      productReferences: productIds.length,
      mappedImages: references.filter((item) => item.thumbnail).length,
      fallbackImages: references.filter((item) => !item.thumbnail).length,
    });
    return { items, totalCount: result.totalCount, page, totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)) };
  }

  async dismiss(userId: string, opportunityId: string): Promise<void> {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId) throw new InvalidStateError("Partner workspace access is not active.");
    await this.repository.dismiss(opportunityId);
  }
}
