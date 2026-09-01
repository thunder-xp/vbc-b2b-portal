import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  const applicationStartedAt = performance.now();
  const body = JSON.stringify({ ok: true });
  const applicationDuration = Math.round((performance.now() - applicationStartedAt) * 10) / 10;
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "public, no-store",
      "Content-Length": String(new TextEncoder().encode(body).byteLength),
      "Content-Type": "application/json",
      "Server-Timing": `application;dur=${applicationDuration}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
