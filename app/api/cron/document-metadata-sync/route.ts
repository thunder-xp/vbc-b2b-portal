import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createDocumentMetadataSyncService } from "@/src/modules/documents/services/document-sync.factory";

export async function GET(request: Request): Promise<Response> {
  if (!(await authorizeCronRequest(request)).authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await createDocumentMetadataSyncService().run(20);
    return Response.json(result, { status: result.completed ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "partner_document_sync_route_failed", errorType: error instanceof Error ? error.name : typeof error });
    return Response.json({ error: "Document synchronization failed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
