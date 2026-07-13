import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { ForbiddenError, InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { PricingInventoryService, ProductCommercialInternalDto } from "../../pricing-inventory/services";
import type { ProjectSpecificationRepository } from "../../project-specifications/repositories";
import { ProjectSpecificationStatus } from "../../project-specifications/types";
import type { ReservationRequestRepository } from "../repositories";
import { ReservationRequestStatus, type ReservationRequest, type ReservationRequestItem } from "../types";

export type ReservationAvailabilityDto = {
  availableStock: number | null;
  nearestArrivalDate: string | null;
  nearestArrivalQuantity: number | null;
};

export type ReservationRequestLineDto = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  slug: string;
  specificationQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number | null;
  partnerPrice: string | null;
  retailPrice: string | null;
  availability: ReservationAvailabilityDto;
};

export type ReservationRequestDetailDto = {
  id: string;
  specificationId: string;
  specificationRevisionId: string;
  projectName: string;
  customerSiteName: string;
  status: ReservationRequestStatus;
  requestedDeliveryDate: string | null;
  partnerComment: string | null;
  managerComment: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  lines: ReservationRequestLineDto[];
};

export type ReservationRequestSummaryDto = {
  id: string;
  projectName: string;
  customerSiteName: string;
  status: ReservationRequestStatus;
  itemCount: number;
  requestedDeliveryDate: string | null;
  submittedAt: string | null;
  createdAt: string;
};

export type ReservationEntryDto = {
  specificationId: string;
  projectName: string;
  customerSiteName: string;
  approved: boolean;
  existingRequestId: string | null;
  latestRequestId: string | null;
};

export interface ReservationRequestService {
  getEntry(userId: string, specificationId: string): Promise<ReservationEntryDto>;
  listOwn(userId: string): Promise<ReservationRequestSummaryDto[]>;
  createDraft(userId: string, input: { specificationId: string; requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ReservationRequest>;
  getDetail(userId: string, requestId: string): Promise<ReservationRequestDetailDto>;
  updateDraft(userId: string, requestId: string, input: { requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ReservationRequest>;
  updateQuantity(userId: string, requestId: string, itemId: string, requestedQuantity: number): Promise<void>;
  submit(userId: string, requestId: string): Promise<ReservationRequest>;
}

const RESERVATION_PERMISSION = "reservations.manage";

export class DefaultReservationRequestService implements ReservationRequestService {
  constructor(
    private readonly repository: ReservationRequestRepository,
    private readonly specificationRepository: ProjectSpecificationRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async getEntry(userId: string, specificationId: string): Promise<ReservationEntryDto> {
    const specification = await this.specificationRepository.findById(specificationId);
    if (!specification) throw new NotFoundError();
    await this.ensureCompany(userId, specification.companyId);
    const [existing, companyRequests] = await Promise.all([
      this.repository.findActiveBySpecificationRevisionId(specification.id),
      this.repository.listByCompanyId(specification.companyId),
    ]);
    const latest = companyRequests.find((request) => request.specificationRevisionId === specification.id) ?? null;
    return {
      specificationId: specification.id,
      projectName: specification.projectName,
      customerSiteName: specification.customerSiteName,
      approved: specification.status === ProjectSpecificationStatus.Approved,
      existingRequestId: existing?.id ?? null,
      latestRequestId: latest?.id ?? null,
    };
  }

  async listOwn(userId: string): Promise<ReservationRequestSummaryDto[]> {
    const companyId = await this.resolveCompanyId(userId);
    const requests = await this.repository.listByCompanyId(companyId);
    return Promise.all(requests.map(async (request) => {
      const [specification, items] = await Promise.all([
        this.specificationRepository.findById(request.specificationRevisionId),
        this.repository.listItems(request.id),
      ]);
      return {
        id: request.id,
        projectName: specification?.projectName ?? "Unavailable specification",
        customerSiteName: specification?.customerSiteName ?? "Unavailable site",
        status: request.status,
        itemCount: items.length,
        requestedDeliveryDate: request.requestedDeliveryDate,
        submittedAt: request.submittedAt,
        createdAt: request.createdAt,
      };
    }));
  }

  async createDraft(userId: string, input: { specificationId: string; requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ReservationRequest> {
    const entry = await this.getEntry(userId, input.specificationId);
    if (!entry.approved) throw new InvalidStateError("Only approved specifications can create reservation requests.");
    if (entry.existingRequestId) throw new InvalidStateError("An active reservation request already exists.");
    const metadata = normalizeDraftMetadata(input);
    return this.repository.createFromApprovedSpecification({ specificationId: input.specificationId, ...metadata });
  }

  async getDetail(userId: string, requestId: string): Promise<ReservationRequestDetailDto> {
    const request = await this.loadOwn(userId, requestId);
    const [items, specification] = await Promise.all([
      this.repository.listItems(request.id),
      this.specificationRepository.findById(request.specificationRevisionId),
    ]);
    if (!specification) throw new NotFoundError();
    const commercial = await this.pricingInventoryService.getProductCommercialViews(userId, items.map((item) => item.productId));
    return toDetail(request, items, specification.projectName, specification.customerSiteName, commercial);
  }

  async updateDraft(userId: string, requestId: string, input: { requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ReservationRequest> {
    const request = await this.loadOwn(userId, requestId);
    ensureDraft(request);
    return this.repository.updateDraft({ requestId, ...normalizeDraftMetadata(input) });
  }

  async updateQuantity(userId: string, requestId: string, itemId: string, requestedQuantity: number): Promise<void> {
    const request = await this.loadOwn(userId, requestId);
    ensureDraft(request);
    const item = (await this.repository.listItems(request.id)).find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundError();
    const quantity = normalizeQuantity(requestedQuantity);
    if (quantity > item.specificationQuantity) throw new InvalidStateError("Requested quantity exceeds the approved specification.");
    await this.repository.updateRequestedQuantity({ itemId, requestedQuantity: quantity });
  }

  async submit(userId: string, requestId: string): Promise<ReservationRequest> {
    const request = await this.loadOwn(userId, requestId);
    ensureDraft(request);
    if (!request.requestedDeliveryDate) throw new InvalidStateError("Preferred delivery date is required.");
    const items = await this.repository.listItems(request.id);
    if (!items.length || items.some((item) => item.requestedQuantity <= 0 || item.requestedQuantity > item.specificationQuantity)) {
      throw new InvalidStateError("Reservation quantities are invalid.");
    }
    return this.repository.submit(request.id);
  }

  private async loadOwn(userId: string, requestId: string): Promise<ReservationRequest> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new NotFoundError();
    await this.ensureCompany(userId, request.companyId);
    return request;
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const membership = (await this.companyAccessService.getOwnMemberships(userId)).find((item) => item.status === MembershipStatus.Active);
    if (!membership) throw new ForbiddenError();
    await this.ensureCompany(userId, membership.companyId);
    return membership.companyId;
  }

  private async ensureCompany(userId: string, companyId: string): Promise<void> {
    await this.companyAccessService.validateCompanyAccess(userId, companyId);
    await this.permissionService.ensurePermission(userId, companyId, RESERVATION_PERMISSION);
  }
}

function ensureDraft(request: ReservationRequest): void {
  if (request.status !== ReservationRequestStatus.Draft) throw new InvalidStateError("Submitted reservation requests are immutable.");
}

function normalizeDraftMetadata(input: { requestedDeliveryDate: string; partnerComment?: string | null }): { requestedDeliveryDate: string; partnerComment: string | null } {
  const requestedDeliveryDate = input.requestedDeliveryDate.trim();
  const date = new Date(`${requestedDeliveryDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDeliveryDate) || Number.isNaN(date.getTime())) throw new InvalidStateError("Preferred delivery date is invalid.");
  const partnerComment = input.partnerComment?.trim() || null;
  if (partnerComment && partnerComment.length > 2000) throw new InvalidStateError("Partner comment is too long.");
  return { requestedDeliveryDate, partnerComment };
}

function normalizeQuantity(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new InvalidStateError("Requested quantity must be a positive integer.");
  return value;
}

function toDetail(request: ReservationRequest, items: ReservationRequestItem[], projectName: string, customerSiteName: string, commercial: ProductCommercialInternalDto[]): ReservationRequestDetailDto {
  const commercialByProduct = new Map(commercial.map((item) => [item.productId, item]));
  return {
    id: request.id, specificationId: request.specificationId, specificationRevisionId: request.specificationRevisionId,
    projectName, customerSiteName, status: request.status, requestedDeliveryDate: request.requestedDeliveryDate,
    partnerComment: request.partnerComment, managerComment: request.managerComment, submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    lines: items.map((item) => {
      const view = commercialByProduct.get(item.productId);
      return {
        id: item.id, productId: item.productId, productName: item.productNameSnapshot, sku: item.skuSnapshot,
        slug: item.slugSnapshot, specificationQuantity: item.specificationQuantity,
        requestedQuantity: item.requestedQuantity, approvedQuantity: item.approvedQuantity,
        partnerPrice: formatSnapshotPrice(item.partnerUnitPriceAmount, item.partnerCurrencyCode),
        retailPrice: formatSnapshotPrice(item.retailUnitPriceAmount, item.retailCurrencyCode),
        availability: {
          availableStock: view?.stock?.exactAvailableQuantity ?? null,
          nearestArrivalDate: view?.stock?.expectedArrival?.expectedDate ?? null,
          nearestArrivalQuantity: view?.stock?.expectedArrival?.expectedQuantity ?? null,
        },
      };
    }),
  };
}

export function formatSnapshotPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  return `${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}
