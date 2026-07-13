import { ForbiddenError, InvalidStateError, NotFoundError } from "../../access-control/services";
import type { PricingInventoryRepository, ProductStockTotal, ProductSupplierArrival } from "../../pricing-inventory/repositories";
import type { ProjectSpecificationRepository } from "../../project-specifications/repositories";
import type { ReservationRequestRepository } from "../repositories";
import { ReservationRequestStatus } from "../types";
import { formatSnapshotPrice, type ReservationRequestDetailDto } from "./reservation-request.service";

export type InternalReservationSummaryDto = {
  id: string; companyName: string; projectName: string; customerSiteName: string;
  status: ReservationRequestStatus; itemCount: number; requestedDeliveryDate: string | null; submittedAt: string | null;
};

export type InternalReservationDetailDto = ReservationRequestDetailDto & { companyName: string };

export interface InternalReservationReviewService {
  listForReview(userId: string): Promise<InternalReservationSummaryDto[]>;
  getDetail(userId: string, requestId: string): Promise<InternalReservationDetailDto>;
  startReview(userId: string, requestId: string): Promise<void>;
  decide(userId: string, input: { requestId: string; status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected; approvedQuantities: Array<{ itemId: string; approvedQuantity: number }>; comment?: string | null }): Promise<void>;
}

export class DefaultInternalReservationReviewService implements InternalReservationReviewService {
  constructor(
    private readonly repository: ReservationRequestRepository,
    private readonly specificationRepository: ProjectSpecificationRepository,
    private readonly pricingRepository: PricingInventoryRepository,
  ) {}

  async listForReview(_userId: string): Promise<InternalReservationSummaryDto[]> {
    await this.ensureReviewer();
    const records = await this.repository.listForInternalReview();
    return Promise.all(records.map(async ({ request, companyName, projectName, customerSiteName }) => ({
      id: request.id, companyName, projectName, customerSiteName, status: request.status,
      itemCount: (await this.repository.listItems(request.id)).length,
      requestedDeliveryDate: request.requestedDeliveryDate, submittedAt: request.submittedAt,
    })));
  }

  async getDetail(_userId: string, requestId: string): Promise<InternalReservationDetailDto> {
    await this.ensureReviewer();
    const request = await this.repository.findById(requestId);
    if (!request) throw new NotFoundError();
    if (request.status === ReservationRequestStatus.Draft) throw new NotFoundError();
    const [items, specification, records] = await Promise.all([
      this.repository.listItems(request.id),
      this.specificationRepository.findById(request.specificationRevisionId),
      this.repository.listForInternalReview(),
    ]);
    if (!specification) throw new NotFoundError();
    const companyName = records.find((record) => record.request.id === request.id)?.companyName ?? "Unavailable partner";
    const [stock, arrivals] = await Promise.all([
      this.pricingRepository.listStockTotalsForProducts?.(items.map((item) => item.productId)) ?? Promise.resolve<ProductStockTotal[]>([]),
      this.pricingRepository.listSupplierArrivalsForProducts?.(items.map((item) => item.productId)) ?? Promise.resolve<ProductSupplierArrival[]>([]),
    ]);
    return {
      id: request.id, companyName, specificationId: request.specificationId,
      specificationRevisionId: request.specificationRevisionId, projectName: specification.projectName,
      customerSiteName: specification.customerSiteName, status: request.status,
      requestedDeliveryDate: request.requestedDeliveryDate, partnerComment: request.partnerComment,
      managerComment: request.managerComment, submittedAt: request.submittedAt, reviewedAt: request.reviewedAt,
      lines: items.map((item) => {
        const total = stock.find((row) => row.productId === item.productId);
        const arrival = arrivals.filter((row) => row.productId === item.productId && row.expectedQuantity > 0).sort((left, right) => left.expectedDate.localeCompare(right.expectedDate))[0];
        return {
          id: item.id, productId: item.productId, productName: item.productNameSnapshot, sku: item.skuSnapshot,
          slug: item.slugSnapshot, specificationQuantity: item.specificationQuantity,
          requestedQuantity: item.requestedQuantity, approvedQuantity: item.approvedQuantity,
          partnerPrice: formatSnapshotPrice(item.partnerUnitPriceAmount, item.partnerCurrencyCode),
          retailPrice: formatSnapshotPrice(item.retailUnitPriceAmount, item.retailCurrencyCode),
          availability: { availableStock: total?.availableQuantity ?? null, nearestArrivalDate: arrival?.expectedDate ?? null, nearestArrivalQuantity: arrival?.expectedQuantity ?? null },
        };
      }),
    };
  }

  async startReview(_userId: string, requestId: string): Promise<void> {
    await this.ensureReviewer();
    const request = await this.repository.findById(requestId);
    if (!request) throw new NotFoundError();
    if (request.status !== ReservationRequestStatus.Submitted) throw new InvalidStateError();
    await this.repository.startReview(request.id);
  }

  async decide(_userId: string, input: { requestId: string; status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected; approvedQuantities: Array<{ itemId: string; approvedQuantity: number }>; comment?: string | null }): Promise<void> {
    await this.ensureReviewer();
    const request = await this.repository.findById(input.requestId);
    if (!request) throw new NotFoundError();
    if (request.status !== ReservationRequestStatus.UnderReview) throw new InvalidStateError();
    const comment = input.comment?.trim() || null;
    if (input.status === ReservationRequestStatus.Rejected && !comment) throw new InvalidStateError("Rejection requires a comment.");
    const items = await this.repository.listItems(request.id);
    const quantities = normalizeDecisions(input.status, items, input.approvedQuantities);
    await this.repository.decide({ requestId: request.id, status: input.status, approvedQuantities: quantities, comment });
  }

  private async ensureReviewer(): Promise<void> {
    if (!(await this.repository.canReviewInternally())) throw new ForbiddenError();
  }
}

function normalizeDecisions(status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected, items: Array<{ id: string; requestedQuantity: number }>, decisions: Array<{ itemId: string; approvedQuantity: number }>) {
  if (status === ReservationRequestStatus.Rejected) return [];
  const decisionMap = new Map(decisions.map((item) => [item.itemId, item.approvedQuantity]));
  const normalized = items.map((item) => {
    const quantity = decisionMap.get(item.id);
    if (!Number.isInteger(quantity) || quantity === undefined || quantity < 0 || quantity > item.requestedQuantity) throw new InvalidStateError("Approved quantity is invalid.");
    return { itemId: item.id, approvedQuantity: quantity };
  });
  const reduced = normalized.some((item, index) => item.approvedQuantity < items[index].requestedQuantity);
  const positive = normalized.some((item) => item.approvedQuantity > 0);
  if (status === ReservationRequestStatus.Approved && reduced) throw new InvalidStateError("Full approval requires all requested quantities.");
  if (status === ReservationRequestStatus.PartiallyApproved && (!reduced || !positive)) throw new InvalidStateError("Partial approval requires reduced positive fulfillment.");
  return normalized;
}
