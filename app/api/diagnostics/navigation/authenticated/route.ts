import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  const applicationStartedAt = performance.now();
  const authStartedAt = performance.now();
  const { data: { user } } = await (await createClient()).auth.getUser();
  const authDuration = Math.round((performance.now() - authStartedAt) * 10) / 10;
  if (!user) return new NextResponse(null, { status: 401, headers: noStoreHeaders(authDuration, performance.now() - applicationStartedAt) });
  const body = JSON.stringify({ ok: true });
  return new NextResponse(body, {
    headers: {
      ...noStoreHeaders(authDuration, performance.now() - applicationStartedAt),
      "Content-Length": String(new TextEncoder().encode(body).byteLength),
      "Content-Type": "application/json",
    },
  });
}

function noStoreHeaders(authDuration: number, applicationDuration: number) {
  return {
    "Cache-Control": "private, no-store",
    "Server-Timing": `application;dur=${Math.round(applicationDuration * 10) / 10}, auth;dur=${authDuration}`,
    "X-Content-Type-Options": "nosniff",
  };
}
