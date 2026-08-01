import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createProductRelationSyncService } from "@/src/modules/integration/services/product-relation-sync.factory";
import { ProductRelationSyncInProgressError } from "@/src/modules/integration/sync/product-relation-sync.service";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!(await authorizeCronRequest(request)).authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await createProductRelationSyncService().synchronize(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ProductRelationSyncInProgressError) {
      return Response.json({ status: "already_running", syncId: error.syncId }, { status: 202 });
    }
    console.error({
      event: "product_relation_sync_route_failed",
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return Response.json({ error: "Product relation synchronization failed." }, { status: 503 });
  }
}
