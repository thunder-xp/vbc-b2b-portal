import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  AuthEmailRecoveryError,
  createAuthEmailRecoveryService,
} from "@/src/modules/admin/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().max(254).refine((value) => /^[^\s@]+@[^\s@]+$/.test(value)),
  correlationId: z.string().uuid(),
  originalErrorConfirmed: z.literal(true),
  mailboxValidityConfirmed: z.literal(true),
  explicitlyAuthorized: z.literal(true),
});

export async function POST(request: Request): Promise<Response> {
  if (!hasServiceRoleCredential(request.headers.get("authorization"))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const actorUserId = await resolveUniqueRecoveryAdmin();
    const service = createAuthEmailRecoveryService();
    const diagnosis = await service.diagnose(parsed.data.email);
    if (!diagnosis.eligible || !diagnosis.authUserId) {
      return Response.json({ error: "NOT_ELIGIBLE", state: diagnosis.identityState }, { status: 409 });
    }
    const result = await service.execute({
      actorUserId,
      authUserId: diagnosis.authUserId,
      correlationId: parsed.data.correlationId,
      originalErrorConfirmed: parsed.data.originalErrorConfirmed,
      mailboxValidityConfirmed: parsed.data.mailboxValidityConfirmed,
      explicitlyAuthorized: parsed.data.explicitlyAuthorized,
    });
    return Response.json({
      accepted: result.deliveryResult === "ACCEPTED",
      idempotent: result.idempotent,
      correlationId: result.correlationId,
    });
  } catch (error) {
    const code = error instanceof AuthEmailRecoveryError ? error.code : "SYSTEM_ERROR";
    const status = code === "RATE_LIMITED" ? 429 : code === "AUDIT_FAILED_AFTER_DELIVERY" ? 500 : 503;
    console.error({ event: "internal_auth_email_recovery_failed", errorCode: code });
    return Response.json({ error: code }, { status });
  }
}

function hasServiceRoleCredential(authorization: string | null): boolean {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !provided) return false;
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

async function resolveUniqueRecoveryAdmin(): Promise<string> {
  const admin = createAdminClient();
  const permission = await admin.from("permissions").select("id").eq("code", "admin.security.manage").single();
  if (permission.error || !permission.data?.id) throw new Error("Permission unavailable");
  const grants = await admin.from("role_permissions").select("role_id").eq("permission_id", permission.data.id);
  const roleIds = [...new Set((grants.data ?? []).map((item) => String(item.role_id)))];
  if (grants.error || roleIds.length === 0) throw new Error("Permission unavailable");
  const assignments = await admin
    .from("internal_user_role_assignments")
    .select("user_id")
    .in("role_id", roleIds)
    .is("revoked_at", null);
  const assignedUserIds = [...new Set((assignments.data ?? []).map((item) => String(item.user_id)))];
  if (assignments.error || assignedUserIds.length === 0) throw new Error("Permission unavailable");
  const profiles = await admin
    .from("user_profiles")
    .select("id")
    .in("id", assignedUserIds)
    .eq("status", "active");
  const actorIds = [...new Set((profiles.data ?? []).map((item) => String(item.id)))];
  if (profiles.error || actorIds.length !== 1 || !z.string().uuid().safeParse(actorIds[0]).success) {
    throw new Error("Recovery actor is ambiguous");
  }
  return actorIds[0]!;
}
