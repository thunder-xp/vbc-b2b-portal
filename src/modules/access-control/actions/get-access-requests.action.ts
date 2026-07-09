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

export type OwnAccessRequestDto = {
  id: string;
  companyId: string | null;
  requestedCompanyName: string | null;
  message: string | null;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export async function getOwnAccessRequestsAction(): Promise<
  ActionResult<OwnAccessRequestDto[]>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const requests = await createAccessRequestService().getOwnAccessRequests(userId);

    return success("Access requests loaded.", requests.map(toOwnAccessRequestDto));
  } catch (error) {
    return failureFromError(error);
  }
}

function toOwnAccessRequestDto(request: AccessRequest): OwnAccessRequestDto {
  return {
    id: request.id,
    companyId: request.companyId,
    requestedCompanyName: request.requestedCompanyName,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
