import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

const TARGET = "/auth/password-recovery";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") === "recovery" ? "recovery" as EmailOtpType : null;
  const supabase = await createClient();
  let error: { code?: string; message: string } | null = null;
  if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  const target = new URL(TARGET, url.origin);
  if (error) target.searchParams.set("recovery_error", classify(error));
  return NextResponse.redirect(target);
}

function classify(error: { code?: string; message: string }) { const signal = `${error.code ?? ""} ${error.message}`.toLowerCase(); return signal.includes("expired") ? "expired" : "invalid"; }
