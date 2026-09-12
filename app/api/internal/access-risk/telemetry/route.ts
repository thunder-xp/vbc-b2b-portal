import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { createAccessRiskService, resolveAccessRiskIdentity } from "@/src/modules/access-risk";
import type { AccessRiskTelemetryBatch } from "@/src/modules/access-risk";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 24_000) return response({ accepted: false, code: "PAYLOAD_TOO_LARGE" }, 413);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims as Record<string, unknown> | undefined;
    const userId = typeof claims?.sub === "string" ? claims.sub : null;
    const sessionId = typeof claims?.session_id === "string" ? claims.session_id : null;
    if (error || !userId || !sessionId) return response({ accepted: false, code: "UNAUTHENTICATED" }, 401);

    const identity = resolveAccessRiskIdentity(request, sessionId);
    if (!identity) return response({ accepted: false, code: "IDENTITY_HASH_UNAVAILABLE" }, 202);
    const body = await request.json() as AccessRiskTelemetryBatch;
    await createAccessRiskService().recordTelemetry(userId, body, identity);
    const result = response({ accepted: true }, 202);
    if (identity.deviceCookie) {
      result.cookies.set(identity.deviceCookie.name, identity.deviceCookie.value, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
        path: "/", maxAge: 365 * 24 * 60 * 60,
      });
    }
    return result;
  } catch (error) {
    console.warn({
      event: "access_risk_telemetry_dropped",
      errorType: error instanceof Error ? error.name : typeof error,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return response({ accepted: false, code: "DROPPED_FAIL_OPEN" }, 202);
  }
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
