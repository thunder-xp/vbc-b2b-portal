import "server-only";

import { timingSafeEqual } from "node:crypto";

export type CronAuthorizationCategory =
  | "authorized"
  | "missing_configuration"
  | "missing_bearer"
  | "invalid_bearer";

export type CronAuthorizationResult = {
  authorized: boolean;
  callerType: "vercel_cron" | "manual";
  category: CronAuthorizationCategory;
  requestId: string;
};

export async function authorizeCronRequest(
  request: Request,
): Promise<CronAuthorizationResult> {
  const expected = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer ([^\s]+)$/i)?.[1] ?? "";
  const callerType = isVercelCron(request) ? "vercel_cron" : "manual";
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();

  const category: CronAuthorizationCategory = !expected
    ? "missing_configuration"
    : !bearer
      ? "missing_bearer"
      : safeEqual(expected, bearer)
        ? "authorized"
        : "invalid_bearer";
  const result: CronAuthorizationResult = {
    authorized: category === "authorized",
    callerType,
    category,
    requestId,
  };

  console.info({
    event: "cron_authorization_checked",
    route: new URL(request.url).pathname,
    authorizationCategory: category,
    callerType,
    requestId,
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
  });
  await persistCronAuthorization(request, result);
  return result;
}

function isVercelCron(request: Request): boolean {
  return request.headers.get("user-agent")?.toLowerCase().includes("vercel-cron")
    || request.headers.has("x-vercel-cron");
}

function safeEqual(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function persistCronAuthorization(
  request: Request,
  result: CronAuthorizationResult,
): Promise<void> {
  if (!process.env.VERCEL_ENV) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error({
      event: "cron_authorization_telemetry_failed",
      errorCategory: "missing_server_configuration",
    });
    return;
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/rpc/record_cron_route_invocation`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_route: new URL(request.url).pathname,
          p_authorized: result.authorized,
          p_auth_category: result.category,
          p_caller_type: result.callerType,
          p_deployment_sha:
            process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
          p_request_id: result.requestId,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(1_500),
      },
    );
    if (!response.ok) {
      console.error({
        event: "cron_authorization_telemetry_failed",
        errorCategory: "database_response",
        statusCode: response.status,
      });
    }
  } catch (error) {
    console.error({
      event: "cron_authorization_telemetry_failed",
      errorCategory: error instanceof Error ? error.name : typeof error,
    });
  }
}
