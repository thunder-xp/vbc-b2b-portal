"use server";

import type { AccessRequest, AccessRequestStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  success,
} from "./action-result";
import {
  createAccessRequestService,
  getAuthenticatedUserId,
} from "./service-factory";

export type SubmitAccessRequestActionInput = {
  requestedCompanyName?: string | null;
  requestedFiscalCode?: string | null;
  contactPhone?: string | null;
  message?: string | null;
};

export type AccessRequestDto = {
  id: string;
  companyId: string | null;
  requestedCompanyName: string | null;
  requestedFiscalCode: string | null;
  contactPhone: string | null;
  message: string | null;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export async function submitAccessRequestAction(
  input: SubmitAccessRequestActionInput = {},
): Promise<ActionResult<AccessRequestDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    const normalizedInput = {
      requestedCompanyName: normalizeOptionalText(input.requestedCompanyName),
      requestedFiscalCode: normalizeOptionalText(input.requestedFiscalCode),
      contactPhone: normalizeOptionalText(input.contactPhone),
      message: normalizeOptionalText(input.message),
    };

    console.info("[access-request-submit] action auth/input", {
      hasAuthenticatedUserId: Boolean(userId),
      userId,
      requestedCompanyNamePresent: Boolean(normalizedInput.requestedCompanyName),
      requestedFiscalCodePresent: Boolean(normalizedInput.requestedFiscalCode),
      contactPhonePresent: Boolean(normalizedInput.contactPhone),
      messagePresent: Boolean(normalizedInput.message),
    });

    const request = await createAccessRequestService().submitAccessRequest({
      userId,
      ...normalizedInput,
    });

    return success("Access request submitted.", toAccessRequestDto(request));
  } catch (error) {
    console.error("[access-request-submit] action failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return failureFromError(error);
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toAccessRequestDto(request: AccessRequest): AccessRequestDto {
  return {
    id: request.id,
    companyId: request.companyId,
    requestedCompanyName: request.requestedCompanyName,
    requestedFiscalCode: request.requestedFiscalCode,
    contactPhone: request.contactPhone,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
