import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";

const ACTIVATION_PATH = "/auth/internal-invitation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = allowedType(url.searchParams.get("type"));
  const code = url.searchParams.get("code");
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return NextResponse.redirect(activationUrl(url, error ? classifyError(error) : null));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(activationUrl(url, error ? classifyError(error) : null));
  }

  // Default Supabase invite/recovery templates can return an implicit session in
  // the URL fragment. Fragments are never sent to the server and are inherited by
  // this clean redirect, then consumed and removed by the activation component.
  return NextResponse.redirect(activationUrl(url, null));
}

function allowedType(value: string | null): EmailOtpType | null {
  return value === "invite" || value === "recovery" ? value : null;
}

function classifyError(error: { code?: string; message: string }): "expired" | "invalid" {
  const safeSignal = `${error.code ?? ""} ${error.message}`.toLowerCase();
  return safeSignal.includes("expired") || safeSignal.includes("otp_expired") ? "expired" : "invalid";
}

function activationUrl(source: URL, error: "expired" | "invalid" | null): URL {
  const target = new URL(ACTIVATION_PATH, source.origin);
  if (error) target.searchParams.set("invite_error", error);
  return target;
}
