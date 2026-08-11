import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { createCompanyUserManagementService } from "@/src/modules/access-control/actions/service-factory";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeInvitationPath(url.searchParams.get("next"));
  if (!code || !nextPath) return NextResponse.redirect(new URL("/auth/sign-in", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`${nextPath}?error=confirmation_failed`, url.origin));
  try {
    await createCompanyUserManagementService().acceptInvitation(tokenFromPath(nextPath)!);
    return NextResponse.redirect(new URL("/cabinet", url.origin));
  } catch {
    return NextResponse.redirect(new URL(`${nextPath}?error=acceptance_failed`, url.origin));
  }
}

function safeInvitationPath(value: string | null): string | null {
  return value && /^\/auth\/invitations\/[A-Za-z0-9_-]{20,256}$/.test(value) ? value : null;
}

function tokenFromPath(path: string): string | null {
  const match = /^\/auth\/invitations\/([^/?#]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}
