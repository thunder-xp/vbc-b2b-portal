import { NextResponse } from "next/server";

import { ForbiddenError, PermissionRequiredError, UnauthenticatedError } from "@/src/modules/access-control/services";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    await requireAdminPermission("campaigns.create");
    const params = new URL(request.url).searchParams;
    const data = await createCommercialCampaignService().searchBuilderProducts({
      search: params.get("search") ?? "",
      categoryId: params.get("categoryId") ?? "",
      brandId: params.get("brandId") ?? "",
      inStockOnly: params.get("inStockOnly") === "true",
      page: Number(params.get("page") ?? "1"),
      pageSize: 25,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const denied = error instanceof PermissionRequiredError || error instanceof ForbiddenError || error instanceof UnauthenticatedError;
    console.error({ event: "campaign_product_search_failed", correlationId, safeErrorCode: denied ? "CAMPAIGN_SEARCH_PERMISSION_DENIED" : "CAMPAIGN_SEARCH_FAILED" });
    return NextResponse.json({ success: false, errorCode: denied ? "CAMPAIGN_SEARCH_PERMISSION_DENIED" : "CAMPAIGN_SEARCH_FAILED", correlationId }, { status: denied ? 403 : 500 });
  }
}
