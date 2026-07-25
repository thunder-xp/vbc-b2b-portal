"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/src/lib/supabase/server";

export type AuthActionState = {
  error: string | null;
};

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email or password is incorrect." };
  }

  redirect(nextPath ?? "/cabinet");
}

export async function registerAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const company = String(formData.get("company") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const nextPath = safeNextPath(formData.get("next"));

  if (!company || !country || !email || !password || !confirmPassword) {
    return { error: "Complete all fields." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        requested_company_name: company,
        country,
      },
    },
  });

  if (error) {
    return { error: "Account could not be created." };
  }

  const query = new URLSearchParams({ registered: "1" });
  if (nextPath) query.set("next", nextPath);
  redirect(`/auth/sign-in?${query.toString()}`);
}

function safeNextPath(value: FormDataEntryValue | null): string | null {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") && path.length <= 500
    ? path
    : null;
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
