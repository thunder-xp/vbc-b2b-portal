"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

import { createFinalCustomerService, getFinalCustomerContext } from "./server";
import { filesFromFormData, storeCustomerServiceAttachments } from "./service-attachments";
import { SupabaseFinalCustomerRepository } from "./supabase.repository";
import { getFinalCustomerLocale } from "./locale";

export type CustomerProfileActionState = { error: string | null; saved: boolean };
export type CustomerServiceActionState = { error: string | null; createdId: string | null };
export type CustomerServiceReplyActionState = { error: string | null; sent: boolean; submissionId: number };
export type CustomerObjectActionState = { error: string | null; savedId: string | null; submissionId: number };

export async function updateCustomerProfileAction(
  _state: CustomerProfileActionState,
  formData: FormData,
): Promise<CustomerProfileActionState> {
  try {
    const context = await getFinalCustomerContext();
    await createFinalCustomerService().updateProfile(context.account, {
      displayName: String(formData.get("displayName") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    revalidatePath("/account");
    revalidatePath("/account/profile");
    return { error: null, saved: true };
  } catch {
    return { error: "PROFILE_UPDATE_FAILED", saved: false };
  }
}

export async function signOutFinalCustomerAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/account/sign-in");
}

export async function createCustomerServiceRequestAction(
  _state: CustomerServiceActionState,
  formData: FormData,
): Promise<CustomerServiceActionState> {
  try {
    const context = await getFinalCustomerContext();
    const request = await createFinalCustomerService().createServiceRequest(context.account, {
      type: String(formData.get("type") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      description: String(formData.get("description") ?? ""),
      preferredContact: String(formData.get("preferredContact") ?? "PHONE"),
      locale: await getFinalCustomerLocale(),
      customerObjectId: String(formData.get("customerObjectId") ?? ""),
      orderId: String(formData.get("orderId") ?? ""),
      orderLineId: String(formData.get("orderLineId") ?? ""),
    });
    let attachmentError: string | null = null;
    try {
      await storeCustomerServiceAttachments({ repository: new SupabaseFinalCustomerRepository(), requestId: request.id,
        messageId: null, actorKind: "CUSTOMER", actorUserId: context.account.authUserId,
        customerIdentityId: context.account.customerIdentityId, visibility: "CUSTOMER_VISIBLE",
        files: filesFromFormData(formData, "files") });
    } catch { attachmentError = "ATTACHMENT_FAILED"; }
    revalidatePath("/account");
    revalidatePath("/account/service");
    return { error: attachmentError, createdId: request.id };
  } catch {
    return { error: "SERVICE_REQUEST_FAILED", createdId: null };
  }
}

export async function saveCustomerObjectAction(
  state: CustomerObjectActionState,
  formData: FormData,
): Promise<CustomerObjectActionState> {
  try {
    const context = await getFinalCustomerContext();
    const service = createFinalCustomerService();
    const objectId = String(formData.get("objectId") ?? "");
    const input = {
      objectId,
      expectedVersion: String(formData.get("expectedVersion") ?? ""),
      name: String(formData.get("name") ?? ""),
      objectType: String(formData.get("objectType") ?? ""),
      locality: String(formData.get("locality") ?? ""),
      addressLabel: String(formData.get("addressLabel") ?? ""),
      retailOrderId: String(formData.get("retailOrderId") ?? ""),
    };
    let savedId = objectId;
    if (objectId) await service.updateCustomerObject(context.account, input);
    else savedId = await service.createCustomerObject(context.account, input);
    revalidatePath("/account");
    revalidatePath("/account/objects");
    revalidatePath(`/account/objects/${savedId}`);
    revalidatePath("/account/purchases");
    return { error: null, savedId, submissionId: state.submissionId + 1 };
  } catch {
    return { error: "CUSTOMER_OBJECT_SAVE_FAILED", savedId: null, submissionId: state.submissionId };
  }
}

export async function archiveCustomerObjectAction(formData: FormData) {
  const context = await getFinalCustomerContext();
  await createFinalCustomerService().archiveCustomerObject(
    context.account,
    String(formData.get("objectId") ?? ""),
    String(formData.get("expectedVersion") ?? ""),
  );
  revalidatePath("/account");
  revalidatePath("/account/objects");
  redirect("/account/objects");
}

export async function linkCustomerObjectPurchaseAction(formData: FormData) {
  const context = await getFinalCustomerContext();
  const objectId = String(formData.get("objectId") ?? "");
  await createFinalCustomerService().linkCustomerObjectPurchase(
    context.account,
    objectId,
    String(formData.get("retailOrderId") ?? ""),
  );
  revalidatePath("/account");
  revalidatePath("/account/objects");
  revalidatePath("/account/purchases");
  redirect(`/account/objects/${objectId}`);
}

export async function replyToCustomerServiceRequestAction(
  state: CustomerServiceReplyActionState,
  formData: FormData,
): Promise<CustomerServiceReplyActionState> {
  try {
    const context = await getFinalCustomerContext();
    const requestId = String(formData.get("requestId") ?? "");
    const messageId = await createFinalCustomerService().replyToServiceRequest(
      context.account, requestId, Number(formData.get("expectedVersion") ?? -1), String(formData.get("body") ?? ""),
    );
    let attachmentError: string | null = null;
    try {
      await storeCustomerServiceAttachments({ repository: new SupabaseFinalCustomerRepository(), requestId,
        messageId, actorKind: "CUSTOMER", actorUserId: context.account.authUserId,
        customerIdentityId: context.account.customerIdentityId, visibility: "CUSTOMER_VISIBLE",
        files: filesFromFormData(formData, "files") });
    } catch { attachmentError = "ATTACHMENT_FAILED"; }
    revalidatePath("/account"); revalidatePath("/account/service"); revalidatePath(`/account/service/${requestId}`);
    return { error: attachmentError, sent: true, submissionId: state.submissionId + 1 };
  } catch { return { error: "SERVICE_REPLY_FAILED", sent: false, submissionId: state.submissionId }; }
}

export async function markCustomerServiceNotificationReadAction(formData: FormData) {
  const context = await getFinalCustomerContext();
  await createFinalCustomerService().markServiceNotificationRead(context.account, String(formData.get("notificationId") ?? ""));
  revalidatePath("/account/service");
}

export async function openFinalCustomerAttentionAction(formData: FormData) {
  const context = await getFinalCustomerContext();
  const target = await createFinalCustomerService().openAttention(
    context.account,
    String(formData.get("sourceKind") ?? ""),
    String(formData.get("sourceId") ?? ""),
  );
  revalidatePath("/account");
  redirect(target);
}

export async function cancelCustomerServiceRequestAction(formData: FormData) {
  const context = await getFinalCustomerContext();
  await createFinalCustomerService().cancelServiceRequest(
    context.account,
    String(formData.get("requestId") ?? ""),
    Number(formData.get("expectedVersion") ?? -1),
  );
  revalidatePath("/account");
  revalidatePath("/account/service");
}
