import { NextResponse } from "next/server";

import { getRetailCartTokenHash } from "@/src/modules/public-retail/retail-cart-cookie";
import { getRetailCartService } from "@/src/modules/public-retail/retail-cart-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getRetailCartService()
    .getSummary(await getRetailCartTokenHash())
    .catch(() => ({ distinctItemCount: 0, totalQuantity: 0 }));
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
