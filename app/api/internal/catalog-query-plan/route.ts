import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "@/src/modules/access-control/actions/service-factory";
import { canApprovePartnerRequests } from "@/src/modules/access-control/services/internal-authorization";
import {
  CATALOG_PLAN_OPERATIONS,
  CatalogQueryPlanService,
  SupabaseCatalogQueryPlanRepository,
  type CatalogPlanOperation,
} from "@/src/modules/catalog/diagnostics";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  if (process.env.CATALOG_PLAN_DIAGNOSTICS_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = await safeJson(request);
  if (!input || !isOperation(input.operation) || !isUuid(input.companyId)) {
    return NextResponse.json({ error: "Invalid diagnostic request" }, { status: 400 });
  }

  try {
    const summary = await new CatalogQueryPlanService(
      new SupabaseCatalogQueryPlanRepository(),
    ).explain(input.operation, input.companyId);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Catalog diagnostic failed" }, { status: 500 });
  }
}

async function authorized(request: Request): Promise<boolean> {
  const expected = process.env.CATALOG_PLAN_DIAGNOSTIC_SECRET ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (safeEqual(supplied, expected)) return true;

  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().getCurrentProfile(userId);
    return Boolean(profile && canApprovePartnerRequests(profile));
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function safeJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isOperation(value: unknown): value is CatalogPlanOperation {
  return typeof value === "string" && CATALOG_PLAN_OPERATIONS.includes(value as CatalogPlanOperation);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
