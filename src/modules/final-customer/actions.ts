"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

import { createFinalCustomerService, getFinalCustomerContext } from "./server";

export type CustomerProfileActionState = { error: string | null; saved: boolean };

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
