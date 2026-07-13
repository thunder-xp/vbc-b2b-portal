import { ForbiddenError, InvalidStateError, NotFoundError } from "../../access-control/services";
import type { ProjectSpecificationRepository } from "../repositories";
import { ProjectSpecificationStatus } from "../types";
import {
  buildSubmittedSpecificationDetail,
  type ProjectSpecificationDetailDto,
} from "./project-specification.service";

export type InternalSpecificationSummaryDto = {
  id: string;
  companyName: string;
  projectName: string;
  customerSiteName: string;
  submittedAt: string;
  itemCount: number;
  partnerPurchaseTotal: string | null;
  retailTotal: string | null;
  potentialGrossProfit: string | null;
  status: ProjectSpecificationStatus;
};

export type InternalSpecificationDetailDto = ProjectSpecificationDetailDto & {
  companyName: string;
};

export interface InternalSpecificationReviewService {
  listForReview(actorUserId: string): Promise<InternalSpecificationSummaryDto[]>;
  getForReview(actorUserId: string, specificationId: string): Promise<InternalSpecificationDetailDto>;
  startReview(actorUserId: string, specificationId: string): Promise<void>;
  decide(actorUserId: string, input: {
    specificationId: string;
    status: ProjectSpecificationStatus.Approved | ProjectSpecificationStatus.ChangesRequested | ProjectSpecificationStatus.Rejected;
    comment: string;
  }): Promise<{ revisionId: string | null }>;
}

export class DefaultInternalSpecificationReviewService implements InternalSpecificationReviewService {
  constructor(private readonly repository: ProjectSpecificationRepository) {}

  async listForReview(actorUserId: string): Promise<InternalSpecificationSummaryDto[]> {
    await this.ensureReviewer(actorUserId);
    const records = await this.repository.listForInternalReview();
    return Promise.all(records.map(async ({ specification, companyName }) => {
      const items = await this.repository.listItems(specification.id);
      const detail = buildSubmittedSpecificationDetail(specification, items, null);
      return {
        id: specification.id,
        companyName,
        projectName: specification.projectName,
        customerSiteName: specification.customerSiteName,
        submittedAt: specification.submittedAt ?? specification.updatedAt,
        itemCount: items.length,
        partnerPurchaseTotal: detail.totals.partnerPurchaseTotal,
        retailTotal: detail.totals.retailTotal,
        potentialGrossProfit: detail.totals.potentialGrossProfit,
        status: specification.status,
      };
    }));
  }

  async getForReview(actorUserId: string, specificationId: string): Promise<InternalSpecificationDetailDto> {
    await this.ensureReviewer(actorUserId);
    const records = await this.repository.listForInternalReview();
    const record = records.find(({ specification }) => specification.id === specificationId.trim());
    if (!record) throw new NotFoundError("Project specification was not found.");
    const items = await this.repository.listItems(record.specification.id);
    return {
      ...buildSubmittedSpecificationDetail(record.specification, items, null),
      companyName: record.companyName,
    };
  }

  async startReview(actorUserId: string, specificationId: string): Promise<void> {
    const detail = await this.getForReview(actorUserId, specificationId);
    if (detail.status !== ProjectSpecificationStatus.Submitted) {
      throw new InvalidStateError("Only submitted specifications can enter review.");
    }
    await this.repository.review({
      specificationId: detail.id,
      status: ProjectSpecificationStatus.UnderReview,
      comment: null,
    });
  }

  async decide(
    actorUserId: string,
    input: {
      specificationId: string;
      status: ProjectSpecificationStatus.Approved | ProjectSpecificationStatus.ChangesRequested | ProjectSpecificationStatus.Rejected;
      comment: string;
    },
  ): Promise<{ revisionId: string | null }> {
    const detail = await this.getForReview(actorUserId, input.specificationId);
    if (detail.status !== ProjectSpecificationStatus.UnderReview) {
      throw new InvalidStateError("Only specifications under review can receive a decision.");
    }
    const comment = input.comment.trim();
    if (!comment || comment.length > 2000) {
      throw new InvalidStateError("A response comment between 1 and 2000 characters is required.");
    }
    const result = await this.repository.review({ specificationId: detail.id, status: input.status, comment });
    return { revisionId: result.revisionId };
  }

  private async ensureReviewer(actorUserId: string): Promise<void> {
    if (!actorUserId.trim() || !(await this.repository.canReviewInternally())) {
      throw new ForbiddenError("Internal specification review permission is required.");
    }
  }
}
