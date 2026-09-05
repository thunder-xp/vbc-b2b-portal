import type { EstimateSalesOpportunityRepository } from "./repository";
import type { EstimateFollowUpState, EstimateSalesOpportunityPermissions, EstimateSalesOpportunitySource, PartnerEstimateSalesOpportunity } from "./types";
import { deriveEstimateGuidedState } from "../estimates/services";

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
      const guided = deriveEstimateGuidedState({
        lifecycleStatus: source.estimateLifecycleStatus,
        estimateStatus: source.estimateStatus === "draft" ? "draft" : "ready",
        lifecycleOrderId: null,
        versionId: source.versionId,
        versionStatus: source.versionStatus,
        acceptedVersionId: source.acceptedVersionId,
        readyDocumentId: source.readyDocumentId,
        currentVersion: true,
        hasDeliveryHistory: Boolean(source.latestDelivery),
        latestDelivery: source.latestDelivery,
        productRequirements: source.productRequirements,
        cartConversions: source.cartConversions,
        companyId,
        userId,
        permissions: { ...permissions, canManage: false },
      });
      if (guided.state === "resume_checkout" && source.acceptedAt) {
        return [toOpportunity(source, "resume_checkout", 1, source.acceptedAt)];
      }
      if (guided.state === "accepted_ready_to_order" && guided.primaryAction === "continue_order" && source.acceptedAt) {
        return [toOpportunity(source, "accepted_ready_to_order", 2, source.acceptedAt)];
      }
      if (guided.state === "ready_to_send" && guided.primaryAction === "send") {
        return [toOpportunity(source, "ready_to_send", 3, source.createdAt)];
      }
      if (["awaiting_customer", "awaiting_customer_opened", "expired"].includes(guided.state) && source.sentAt) {
        const followUpState = deriveFollowUpState(source);
        const action = followUpState === "expired_sent" ? "update" : permissions.canSend && source.readyDocumentId ? "resend" : "review";
        return [toOpportunity(source, "awaiting_customer", 4, source.sentAt, followUpState, action)];
      }
      return [];
    }).sort(compareOpportunities).slice(0, limit);
  }
}

export function deriveFollowUpState(source: EstimateSalesOpportunitySource): EstimateFollowUpState {
  if (source.estimateLifecycleStatus === "expired") return "expired_sent";
  const delivery = source.latestDelivery;
  if (!delivery || delivery.response || !delivery.sentAt || !["sent", "delivered"].includes(delivery.status)) return "sent";
  return delivery.openedAt ? "sent_opened_no_response" : "sent_not_opened";
}

function toOpportunity(
  source: Awaited<ReturnType<EstimateSalesOpportunityRepository["listCurrent"]>>[number],
  type: PartnerEstimateSalesOpportunity["type"],
  priority: 1 | 2 | 3 | 4,
  waitingSince: string,
  followUpState: EstimateFollowUpState | null = null,
  action: PartnerEstimateSalesOpportunity["action"] = type === "resume_checkout" ? "resume_checkout" : type === "accepted_ready_to_order" ? "continue_order" : "open_and_send",
): PartnerEstimateSalesOpportunity {
  return { id: `${type}:${source.versionId}`, type, priority, estimateId: source.estimateId, versionId: source.versionId, estimateNumber: source.estimateNumber,
    proposalName: source.proposalName, customerName: source.customerName, projectName: source.projectName, amount: source.amount, currency: source.currency,
    waitingSince, validUntil: source.lifecycleExpiresAt, followUpState, action, href: opportunityHref(source, type, action) };
}

function opportunityHref(source: EstimateSalesOpportunitySource, type: PartnerEstimateSalesOpportunity["type"], action: PartnerEstimateSalesOpportunity["action"]): string {
  if (type === "resume_checkout") return "/cabinet/cart";
  const base = `/cabinet/estimates/${source.estimateId}`;
  if (type === "accepted_ready_to_order") return `${base}#estimate-order-conversion`;
  if (action === "resend") return `${base}?proposalAction=resend&version=${encodeURIComponent(source.versionId)}#estimate-order-conversion`;
  return type === "awaiting_customer" ? `${base}#estimate-order-conversion` : base;
}

function compareOpportunities(left: PartnerEstimateSalesOpportunity, right: PartnerEstimateSalesOpportunity): number {
  const priority = left.priority - right.priority;
  if (priority) return priority;
  if (left.type === "awaiting_customer" && right.type === "awaiting_customer") {
    const state = followUpPriority(left.followUpState) - followUpPriority(right.followUpState);
    if (state) return state;
    const age = left.waitingSince.localeCompare(right.waitingSince);
    if (age) return age;
  }
  return right.amount - left.amount || left.waitingSince.localeCompare(right.waitingSince) || left.id.localeCompare(right.id);
}

function followUpPriority(state: EstimateFollowUpState | null): number {
  return ({ expired_sent: 0, sent_opened_no_response: 1, sent_not_opened: 2, sent: 3 } as const)[state ?? "sent"];
}
