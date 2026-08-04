import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { runCurrentProductMappingAuditPage } from "@/src/modules/integration/audits/current-product-mapping-audit";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!(await authorizeCronRequest(request)).authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 100_000, 0);
  const limit = boundedInteger(url.searchParams.get("limit"), 1, 50, 50);
  try {
    return Response.json(await runCurrentProductMappingAuditPage({ offset, limit }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "current_product_mapping_audit_failed",
      offset,
      limit,
      errorType: error instanceof Error ? error.name : typeof error,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return Response.json({ error: "Product mapping audit failed." }, { status: 503 });
  }
}

function boundedInteger(value: string | null, minimum: number, maximum: number, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

