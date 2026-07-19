import { ForbiddenError, InvalidStateError } from "../../access-control/services";
import type { InternalOrderDateChangeRecord, OrderDateChangeRequestRepository } from "../repositories/order-date-change.repository";
import type { OrderDateChangeRequest } from "../types";

export interface InternalOrderDateChangeService {
  listPending(userId: string): Promise<InternalOrderDateChangeRecord[]>;
  review(userId: string, input: { requestId: string; decision: "approved" | "rejected"; comment: string }): Promise<OrderDateChangeRequest>;
}

export class DefaultInternalOrderDateChangeService implements InternalOrderDateChangeService {
  constructor(private readonly repository: OrderDateChangeRequestRepository) {}

  async listPending(userId: string) {
    void userId;
    await this.ensureReviewer();
    return this.repository.listPendingForReview();
  }

  async review(userId: string, input: { requestId: string; decision: "approved" | "rejected"; comment: string }) {
    void userId;
    await this.ensureReviewer();
    const comment = input.comment.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new InvalidStateError();
    if (!(["approved", "rejected"] as const).includes(input.decision)) throw new InvalidStateError();
    if (comment.length > 1000 || (input.decision === "rejected" && !comment)) throw new InvalidStateError("Rejection requires a comment.");
    return this.repository.review({ requestId: input.requestId.toLowerCase(), decision: input.decision, comment: comment || null });
  }

  private async ensureReviewer() {
    if (!(await this.repository.canReviewInternally())) throw new ForbiddenError();
  }
}
