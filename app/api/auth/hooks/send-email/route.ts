import { randomUUID } from "node:crypto";

import { handleSupabaseSendEmailHook, SendEmailHookError } from "@/src/modules/auth/send-email-hook.service";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HOOK_BYTES = 64 * 1024;
const SMTP_RETRY_AFTER_SECONDS = "3";

export function GET(): Response {
  return methodNotAllowed();
}

export function PUT(): Response {
  return methodNotAllowed();
}

export function PATCH(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}

export function OPTIONS(): Response {
  return methodNotAllowed();
}

export function HEAD(): Response {
  const correlationId = randomUUID();
  return new Response(null, {
    status: 405,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json", "X-Correlation-Id": correlationId, Allow: "POST" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  const startedAt = performance.now();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response("INVALID_REQUEST", 400, correlationId);
  }
  const announced = request.headers.get("content-length");
  if (announced !== null) {
    const length = Number(announced);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_HOOK_BYTES) {
      return response("INVALID_REQUEST", 400, correlationId);
    }
  }

  const rawPayload = await readBoundedBody(request);
  if (rawPayload === null) return response("INVALID_REQUEST", 400, correlationId);

  try {
    const result = await handleSupabaseSendEmailHook(rawPayload, request.headers, { correlationId, startedAt });
    return new Response("{}", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-Correlation-Id": result.correlationId,
        "X-Auth-Hook-Duration-Ms": String(result.durationMs),
      },
    });
  } catch (error) {
    const code = error instanceof SendEmailHookError ? error.code : "DELIVERY_UNAVAILABLE";
    const retryable = code === "DELIVERY_UNAVAILABLE";
    const status = code === "SIGNATURE_INVALID" ? 401
      : code === "PAYLOAD_INVALID" ? 400
        : 503;
    console.error({ event: "supabase_send_email_hook_failed", correlationId, code, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) });
    return response(code === "CONFIGURATION_INVALID" || code === "DELIVERY_CONFIGURATION_INVALID" ? "DELIVERY_UNAVAILABLE" : code,
      status, correlationId, retryable ? SMTP_RETRY_AFTER_SECONDS : undefined);
  }
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_HOOK_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const payload = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    return null;
  }
}

function response(code: string, status: number, correlationId: string, retryAfter?: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json", "X-Correlation-Id": correlationId });
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return Response.json({ error: { http_code: status, message: code } }, { status, headers });
}

function methodNotAllowed(): Response {
  const result = response("METHOD_NOT_ALLOWED", 405, randomUUID());
  result.headers.set("Allow", "POST");
  return result;
}
