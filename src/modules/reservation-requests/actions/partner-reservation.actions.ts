"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { ReservationEntryDto, ReservationRequestDetailDto, ReservationRequestSummaryDto } from "../services";
import { createReservationRequestService } from "./service-factory";

export async function getReservationEntryAction(specificationId: string): Promise<ActionResult<ReservationEntryDto>> {
  if (!specificationId.trim()) return invalidInput("Specification is required.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Reservation entry loaded.", await createReservationRequestService().getEntry(userId, specificationId));
  } catch (error) { return failureFromError(error); }
}

export async function listOwnReservationRequestsAction(): Promise<ActionResult<ReservationRequestSummaryDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Reservation requests loaded.", await createReservationRequestService().listOwn(userId));
  } catch (error) { return failureFromError(error); }
}

export async function getReservationRequestAction(requestId: string): Promise<ActionResult<ReservationRequestDetailDto>> {
  if (!requestId.trim()) return invalidInput("Reservation request is required.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Reservation request loaded.", await createReservationRequestService().getDetail(userId, requestId));
  } catch (error) { return failureFromError(error); }
}

export async function createReservationRequestAction(input: { specificationId: string; requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ActionResult<{ id: string }>> {
  if (!input.specificationId?.trim() || !input.requestedDeliveryDate?.trim()) return invalidInput("Specification and preferred delivery date are required.");
  try {
    const userId = await getAuthenticatedUserId();
    const request = await createReservationRequestService().createDraft(userId, input);
    revalidatePath("/cabinet/reservation-requests");
    revalidatePath(`/cabinet/specifications/${input.specificationId}`);
    return success("Reservation request draft created.", { id: request.id });
  } catch (error) { return failureFromError(error); }
}

export async function updateReservationRequestAction(requestId: string, input: { requestedDeliveryDate: string; partnerComment?: string | null }): Promise<ActionResult<null>> {
  if (!requestId.trim() || !input.requestedDeliveryDate?.trim()) return invalidInput("Preferred delivery date is required.");
  try {
    const userId = await getAuthenticatedUserId();
    await createReservationRequestService().updateDraft(userId, requestId, input);
    revalidatePath(`/cabinet/reservation-requests/${requestId}`);
    return success("Reservation request saved.", null);
  } catch (error) { return failureFromError(error); }
}

export async function updateReservationQuantityAction(requestId: string, itemId: string, requestedQuantity: number): Promise<ActionResult<null>> {
  if (!requestId.trim() || !itemId.trim() || !Number.isInteger(requestedQuantity)) return invalidInput("Requested quantity is invalid.");
  try {
    const userId = await getAuthenticatedUserId();
    await createReservationRequestService().updateQuantity(userId, requestId, itemId, requestedQuantity);
    revalidatePath(`/cabinet/reservation-requests/${requestId}`);
    return success("Requested quantity saved.", null);
  } catch (error) { return failureFromError(error); }
}

export async function submitReservationRequestAction(requestId: string): Promise<ActionResult<null>> {
  if (!requestId.trim()) return invalidInput("Reservation request is required.");
  try {
    const userId = await getAuthenticatedUserId();
    await createReservationRequestService().submit(userId, requestId);
    revalidatePath(`/cabinet/reservation-requests/${requestId}`);
    revalidatePath("/cabinet/reservation-requests");
    revalidatePath("/admin/reservation-requests");
    return success("Reservation request submitted to Novotech.", null);
  } catch (error) { return failureFromError(error); }
}
