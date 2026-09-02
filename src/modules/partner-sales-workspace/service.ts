import type { EstimateSalesOpportunityRepository } from "./repository";
import type { EstimateSalesOpportunityPermissions, PartnerEstimateSalesOpportunity } from "./types";

export class PartnerSalesWorkspaceService {
  constructor(private readonly repository: EstimateSalesOpportunityRepository) {}

  async listEstimateOpportunities(
    companyId: string,
    permissions: EstimateSalesOpportunityPermissions,
    limit = 6,
  ): Promise<PartnerEstimateSalesOpportunity[]> {
    if (!permissions.canView) return [];
    const sources = await this.repository.listCurrent(companyId, limit);
    const latestByEstimate = new Map<string, (typeof sources)[number]>();
    for (const source of sources) if (!latestByEstimate.has(source.estimateId)) latestByEstimate.set(source.estimateId, source);
    return [...latestByEstimate.values()].flatMap((source): PartnerEstimateSalesOpportunity[] => {
      if (source.estimateStatus === "archived") return [];
      if (permissions.canSend && source.versionStatus === "prepared" && source.estimateLifecycleStatus === "draft" && source.readyDocumentId) {
        return [toOpportunity(source, "ready_to_send", 1, source.createdAt)];
      }
      if (source.versionStatus === "sent" && source.estimateLifecycleStatus === "sent" && source.sentAt) {
        return [toOpportunity(source, "awaiting_customer", 2, source.sentAt)];
      }
      return [];
    }).sort((left, right) => left.priority - right.priority || left.waitingSince.localeCompare(right.waitingSince) || left.id.localeCompare(right.id)).slice(0, limit);
  }
}

function toOpportunity(source: Awaited<ReturnType<EstimateSalesOpportunityRepository["listCurrent"]>>[number], type: PartnerEstimateSalesOpportunity["type"], priority: 1 | 2, waitingSince: string): PartnerEstimateSalesOpportunity {
  return { id: `${type}:${source.versionId}`, type, priority, estimateId: source.estimateId, versionId: source.versionId, estimateNumber: source.estimateNumber,
    proposalName: source.proposalName, customerName: source.customerName, projectName: source.projectName, amount: source.amount, currency: source.currency,
    waitingSince, href: `/cabinet/estimates/${source.estimateId}` };
}
