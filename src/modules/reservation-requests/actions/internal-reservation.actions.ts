"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { InternalReservationDetailDto, InternalReservationSummaryDto } from "../services";
import { ReservationRequestStatus } from "../types";
import { createInternalReservationReviewService } from "./service-factory";

export async function listInternalReservationRequestsAction(): Promise<ActionResult<InternalReservationSummaryDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Reservation review queue loaded.", await createInternalReservationReviewService().listForReview(userId));
  } catch (error) { return failureFromError(error); }
}

export async function getInternalReservationRequestAction(requestId: string): Promise<ActionResult<InternalReservationDetailDto>> {
  if (!requestId.trim()) return invalidInput("Reservation request is required.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Reservation request loaded.", await createInternalReservationReviewService().getDetail(userId, requestId));
  } catch (error) { return failureFromError(error); }
}

export async function startReservationReviewAction(requestId: string): Promise<ActionResult<null>> {
  if (!requestId.trim()) return invalidInput("Reservation request is required.");
  try {
    const userId = await getAuthenticatedUserId();
    await createInternalReservationReviewService().startReview(userId, requestId);
    revalidateReservationPaths(requestId);
    return success("Reservation review started.", null);
  } catch (error) { return failureFromError(error); }
}

export async function decideReservationRequestAction(input: {
  requestId: string;
  status: ReservationRequestStatus.Approved | ReservationRequestStatus.PartiallyApproved | ReservationRequestStatus.Rejected;
  approvedQuantities: Array<{ itemId: string; approvedQuantity: number }>;
  comment?: string | null;
}): Promise<ActionResult<null>> {
  if (!input.requestId?.trim() || ![ReservationRequestStatus.Approved, ReservationRequestStatus.PartiallyApproved, ReservationRequestStatus.Rejected].includes(input.status)) return invalidInput("Reservation decision is invalid.");
  try {
    const userId = await getAuthenticatedUserId();
    await createInternalReservationReviewService().decide(userId, input);
    revalidateReservationPaths(input.requestId);
    return success("Reservation decision saved.", null);
  } catch (error) { return failureFromError(error); }
}

function revalidateReservationPaths(requestId: string): void {
  revalidatePath(`/admin/reservation-requests/${requestId}`);
  revalidatePath("/admin/reservation-requests");
  revalidatePath(`/cabinet/reservation-requests/${requestId}`);
  revalidatePath("/cabinet/reservation-requests");
}
