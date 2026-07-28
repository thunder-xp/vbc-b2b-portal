"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import type { AccessRequestStatus } from "../../types";
import type { AccessRequestReview } from "../../services";
import {
  type ActionResult,
  failureFromError,
  invalidInput,
  success,
} from "../action-result";
import {
  createAccessApprovalService,
  getAuthenticatedUserId,
} from "../service-factory";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { getOneCEnv } from "@/src/lib/env";
import { createPartnerLookupService } from "@/src/modules/integration/services";
import { ApprovalError } from "../../services";

export type AccessRequestReviewDto = {
  id: string;
  requesterUserId: string;
  requesterEmail: string | null;
  requesterName: string | null;
  requestedCompanyName: string | null;
  requestedFiscalCode: string | null;
  contactPhone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApproveAccessRequestActionInput = {
  requestId?: string | null;
  external1cId?: string | null;
  external1cCode?: string | null;
  external1cContractId?: string | null;
  external1cPriceTypeId?: string | null;
  decisionReason?: string | null;
};

export type RejectAccessRequestActionInput = {
  requestId?: string | null;
  reason?: string | null;
};

export async function listPendingAccessRequestsForReviewAction(): Promise<
  ActionResult<AccessRequestReviewDto[]>
> {
  try {
    await requireAdminPermission("admin.access_requests.view");
    const actorUserId = await getAuthenticatedUserId();
    const reviews =
      await createAccessApprovalService().listPendingReviewRequests(actorUserId);

    return success("Pending access requests loaded.", reviews.map(toReviewDto));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getAccessRequestForReviewAction(
  requestId: string,
): Promise<ActionResult<AccessRequestReviewDto>> {
  try {
    await requireAdminPermission("admin.access_requests.view");
    const normalizedRequestId = normalizeRequiredText(requestId);

    if (!normalizedRequestId) {
      return invalidInput("Access request is required.");
    }

    const actorUserId = await getAuthenticatedUserId();
    const review = await createAccessApprovalService().getRequestForReview(
      actorUserId,
      normalizedRequestId,
    );

    return success("Access request loaded.", toReviewDto(review));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function approveAccessRequestAction(
  input: ApproveAccessRequestActionInput,
): Promise<ActionResult<AccessRequestReviewDto>> {
  const requestId = normalizeRequiredText(input.requestId);
  const external1cId = normalizeRequiredText(input.external1cId);
  const external1cCode = normalizeOptionalText(input.external1cCode);
  const external1cContractId = normalizeOptionalText(input.external1cContractId);
  const external1cPriceTypeId = normalizeRequiredText(input.external1cPriceTypeId);

  if (!requestId) {
    return invalidInput("Access request is required.");
  }

  if (!external1cId) {
    return invalidInput("Выберите контрагента в 1С.");
  }

  if (!external1cPriceTypeId) {
    return invalidInput("Выберите статус партнёра.");
  }

  try {
    const correlationId = randomUUID();
    await requireAdminPermission("access_requests.approve");
    const actorUserId = await getAuthenticatedUserId();
    const approvalService = createAccessApprovalService();
    const review = await approvalService.getRequestForReview(
      actorUserId,
      requestId,
    );

    if (!review.request.requestedFiscalCode) {
      throw new ApprovalError(
        "APPROVAL_FISCAL_CODE_REQUIRED",
        correlationId,
      );
    }

    try {
      await createPartnerLookupService(getOneCEnv()).validateApprovalBinding({
        partnerReference: external1cId,
        contractReference: external1cContractId,
        priceTypeReference: external1cPriceTypeId,
        expectedFiscalCode: review.request.requestedFiscalCode,
      });
    } catch (error) {
      console.error({
        event: "partner_access_approval_binding_validation_failed",
        requestId,
        reviewerId: actorUserId,
        correlationId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new ApprovalError("APPROVAL_1C_BINDING_INVALID", correlationId);
    }

    const result = await approvalService.approveAccessRequest({
      actorUserId,
      requestId,
      external1cId,
      external1cCode,
      external1cContractId,
      external1cPriceTypeId,
      decisionReason: normalizeOptionalText(input.decisionReason),
      correlationId,
    });

    revalidatePath("/admin/access-requests");
    revalidatePath(`/admin/access-requests/${requestId}`);
    revalidatePath("/admin/partner-requests");
    revalidatePath(`/admin/partner-requests/${requestId}`);
    revalidatePath("/onboarding/waiting");
    revalidatePath("/cabinet");

    return success("Доступ партнёра одобрен.", {
      ...toReviewDto({
        request: result.request,
        requester: result.requester,
      }),
      status: result.request.status,
    });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function rejectAccessRequestAction(
  input: RejectAccessRequestActionInput,
): Promise<ActionResult<AccessRequestReviewDto>> {
  const requestId = normalizeRequiredText(input.requestId);
  const reason = normalizeRequiredText(input.reason);

  if (!requestId) {
    return invalidInput("Access request is required.");
  }

  if (!reason) {
    return invalidInput("Rejection reason is required.");
  }

  try {
    await requireAdminPermission("access_requests.approve");
    const actorUserId = await getAuthenticatedUserId();
    const request = await createAccessApprovalService().rejectAccessRequest({
      actorUserId,
      requestId,
      reason,
    });

    revalidatePath("/admin/access-requests");
    revalidatePath(`/admin/access-requests/${requestId}`);
    revalidatePath("/admin/partner-requests");
    revalidatePath(`/admin/partner-requests/${requestId}`);
    revalidatePath("/onboarding/waiting");

    return success("Access request rejected.", {
      id: request.id,
      requesterUserId: request.userId,
      requesterEmail: null,
      requesterName: null,
      requestedCompanyName: request.requestedCompanyName,
      requestedFiscalCode: request.requestedFiscalCode,
      contactPhone: request.contactPhone,
      message: request.message,
      status: request.status,
      decisionReason: request.decisionReason,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    });
  } catch (error) {
    return failureFromError(error);
  }
}

function toReviewDto(review: AccessRequestReview): AccessRequestReviewDto {
  return {
    id: review.request.id,
    requesterUserId: review.request.userId,
    requesterEmail: review.requester?.email ?? null,
    requesterName: review.requester?.fullName ?? null,
    requestedCompanyName: review.request.requestedCompanyName,
    requestedFiscalCode: review.request.requestedFiscalCode,
    contactPhone: review.request.contactPhone,
    message: review.request.message,
    status: review.request.status,
    decisionReason: review.request.decisionReason,
    createdAt: review.request.createdAt,
    updatedAt: review.request.updatedAt,
  };
}

function normalizeRequiredText(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
