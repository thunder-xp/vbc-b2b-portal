import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  // Phase 1 deliberately performs no payment confirmation or RetailOrder activation.
  return NextResponse.json({ accepted: false, phase: "payment_confirmation_not_enabled" }, { status: 202 });
}
