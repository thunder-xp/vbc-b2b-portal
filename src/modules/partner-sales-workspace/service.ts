import type { EstimateSalesOpportunityRepository } from "./repository";
import type { EstimateSalesOpportunityPermissions, PartnerEstimateSalesOpportunity } from "./types";

export class PartnerSalesWorkspaceService {
  constructor(private readonly repository: EstimateSalesOpportunityRepository) {}

  async listEstimateOpportunities(
    companyId: string,
    userId: string,
    permissions: EstimateSalesOpportunityPermissions,
    limit = 6,
  ): Promise<PartnerEstimateSalesOpportunity[]> {
    if (!permissions.canView) return [];
    const sources = await this.repository.listCurrent(companyId, userId, limit);
    const latestByEstimate = new Map<string, (typeof sources)[number]>();
    for (const source of sources) if (!latestByEstimate.has(source.estimateId)) latestByEstimate.set(source.estimateId, source);
    return [...latestByEstimate.values()].flatMap((source): PartnerEstimateSalesOpportunity[] => {
      if (source.estimateStatus === "archived") return [];
      if (
        permissions.canConvert
        && permissions.canManageOrders
        && source.versionStatus === "accepted"
        && source.estimateLifecycleStatus === "accepted"
        && source.acceptedVersionId === source.versionId
        && source.acceptedAt
      ) {
        const resumeCartId = findResumableCartId(source, companyId, userId);
        if (resumeCartId) return [toOpportunity(source, "resume_checkout", 1, source.acceptedAt)];
        if (hasVersionConversion(source)) return [];
        return [toOpportunity(source, "accepted_ready_to_order", 2, source.acceptedAt)];
      }
      if (permissions.canSend && source.versionStatus === "prepared" && source.estimateLifecycleStatus === "draft" && source.readyDocumentId) {
        return [toOpportunity(source, "ready_to_send", 3, source.createdAt)];
      }
      if (source.versionStatus === "sent" && source.estimateLifecycleStatus === "sent" && source.sentAt) {
        return [toOpportunity(source, "awaiting_customer", 4, source.sentAt)];
      }
      return [];
    }).sort((left, right) => left.priority - right.priority || right.amount - left.amount || left.waitingSince.localeCompare(right.waitingSince) || left.id.localeCompare(right.id)).slice(0, limit);
  }
}

function findResumableCartId(
  source: Awaited<ReturnType<EstimateSalesOpportunityRepository["listCurrent"]>>[number],
  companyId: string,
  userId: string,
): string | null {
  const requirements = aggregateQuantities(source.productRequirements);
  if (!requirements.size) return null;
  for (const conversion of source.cartConversions) {
    const cart = conversion.cart;
    if (
      conversion.direction !== "estimate_to_cart"
      || conversion.versionId !== source.versionId
      || conversion.createdBy !== userId
      || !cart
      || cart.id === ""
      || cart.companyId !== companyId
      || cart.createdBy !== userId
      || cart.status !== "active"
    ) continue;
    const cartQuantities = aggregateQuantities(cart.items);
    if ([...requirements].every(([productId, quantity]) => (cartQuantities.get(productId) ?? 0) >= quantity)) return cart.id;
  }
  return null;
}

function hasVersionConversion(source: Awaited<ReturnType<EstimateSalesOpportunityRepository["listCurrent"]>>[number]): boolean {
  return source.cartConversions.some((conversion) =>
    conversion.direction === "estimate_to_cart" && conversion.versionId === source.versionId,
  );
}

function aggregateQuantities(items: Array<{ productId: string; quantity: number }>): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return quantities;
}

function toOpportunity(source: Awaited<ReturnType<EstimateSalesOpportunityRepository["listCurrent"]>>[number], type: PartnerEstimateSalesOpportunity["type"], priority: 1 | 2 | 3 | 4, waitingSince: string): PartnerEstimateSalesOpportunity {
  return { id: `${type}:${source.versionId}`, type, priority, estimateId: source.estimateId, versionId: source.versionId, estimateNumber: source.estimateNumber,
    proposalName: source.proposalName, customerName: source.customerName, projectName: source.projectName, amount: source.amount, currency: source.currency,
    waitingSince, href: type === "resume_checkout" ? "/cabinet/cart" : `/cabinet/estimates/${source.estimateId}${type === "accepted_ready_to_order" ? "#estimate-order-conversion" : ""}` };
}
