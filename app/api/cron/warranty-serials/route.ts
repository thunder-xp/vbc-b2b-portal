import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createWarrantySerialSyncService } from "@/src/modules/warranty-serials/factory";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await createWarrantySerialSyncService().runBatch(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "warranty_serial_sync_route_failed", errorType: error instanceof Error ? error.name : typeof error });
    return Response.json({ error: "Warranty serial synchronization failed." }, { status: 503 });
  }
}
