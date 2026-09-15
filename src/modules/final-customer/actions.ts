"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

import { createFinalCustomerService, getFinalCustomerContext } from "./server";

export type CustomerProfileActionState = { error: string | null; saved: boolean };
export type CustomerServiceActionState = { error: string | null; createdId: string | null };

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
      orderId: String(formData.get("orderId") ?? ""),
      orderLineId: String(formData.get("orderLineId") ?? ""),
    });
    revalidatePath("/account");
    revalidatePath("/account/service");
    return { error: null, createdId: request.id };
  } catch {
    return { error: "SERVICE_REQUEST_FAILED", createdId: null };
  }
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
