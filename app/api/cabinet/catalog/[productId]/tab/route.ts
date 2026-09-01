import { NextResponse } from "next/server";
import { z } from "zod";

import { getCatalogProductDetailByIdAction } from "@/src/modules/catalog/actions/product-page.action";
import { isTransportedProductTab, type ProductTabTransportResponse } from "@/src/modules/catalog/contracts/product-tab-transport";
import { getRetailPriceHistoryAction } from "@/src/modules/pricing-inventory/actions";

const productIdSchema = z.string().uuid();

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const startedAt = performance.now();
  const parsedProductId = productIdSchema.safeParse((await params).productId);
  const tab = new URL(request.url).searchParams.get("tab");
  if (!parsedProductId.success || !isTransportedProductTab(tab)) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  if (tab === "pricing") {
    const result = await getRetailPriceHistoryAction(parsedProductId.data, "all");
    if (!result.success && result.errorCode === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    const body: ProductTabTransportResponse = {
      data: { tab, history: result.success ? result.data : null, error: result.success ? null : result.message },
      serverDurationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    };
    return json(body);
  }

  const result = await getCatalogProductDetailByIdAction(parsedProductId.data, {
    includeAttributes: tab === "characteristics" || tab === "datasheet",
    includeDocuments: tab === "datasheet",
    includeImages: false,
  });
  if (!result.success) {
    const status = result.errorCode === "AUTH_REQUIRED" ? 401 : result.errorCode === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "TAB_UNAVAILABLE" : result.errorCode }, { status });
  }
  if (!result.data) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });

  const body: ProductTabTransportResponse = {
    data: { tab, product: result.data },
    serverDurationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  };
  return json(body);
}

function json(body: ProductTabTransportResponse) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `tab;dur=${body.serverDurationMs}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
