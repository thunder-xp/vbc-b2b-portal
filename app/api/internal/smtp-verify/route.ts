import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { verifySmtpTransport } from "@/src/modules/estimates/services";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await verifySmtpTransport();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request): boolean {
  const expected = process.env.SMTP_DIAGNOSTIC_SECRET ?? process.env.CRON_SECRET ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right);
}
