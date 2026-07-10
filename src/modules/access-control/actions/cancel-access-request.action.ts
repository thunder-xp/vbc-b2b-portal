"use server";

import type { AccessRequest, AccessRequestStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  invalidInput,
  success,
} from "./action-result";
import {
  createAccessRequestService,
  getAuthenticatedUserId,
} from "./service-factory";

export type CancelAccessRequestActionInput = {
  requestId?: string | null;
};

export type CancelledAccessRequestDto = {
  id: string;
  companyId: string | null;
  requestedCompanyName: string | null;
  requestedFiscalCode: string | null;
  contactPhone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function cancelOwnAccessRequestAction(
  input: CancelAccessRequestActionInput = {},
): Promise<ActionResult<CancelledAccessRequestDto>> {
  const requestId = normalizeRequiredText(input.requestId);

  if (!requestId) {
    return invalidInput("Access request is required.");
  }

  try {
    const userId = await getAuthenticatedUserId();
    const request = await createAccessRequestService().cancelOwnPendingRequest(
      userId,
      requestId,
    );

    return success("Access request cancelled.", toCancelledAccessRequestDto(request));
  } catch (error) {
    return failureFromError(error);
  }
}

function normalizeRequiredText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toCancelledAccessRequestDto(
  request: AccessRequest,
): CancelledAccessRequestDto {
  return {
    id: request.id,
    companyId: request.companyId,
    requestedCompanyName: request.requestedCompanyName,
    requestedFiscalCode: request.requestedFiscalCode,
    contactPhone: request.contactPhone,
    message: request.message,
    status: request.status,
    decisionReason: request.decisionReason,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
