import {
  handleSupabaseSendEmailHook,
  SendEmailHookError,
} from "@/src/modules/auth/auth-email-hook.service";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HOOK_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response("INVALID_REQUEST", 400);
  }
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (announced > MAX_HOOK_BYTES) return response("INVALID_REQUEST", 400);
  const rawPayload = await request.text();
  if (new TextEncoder().encode(rawPayload).byteLength > MAX_HOOK_BYTES) {
    return response("INVALID_REQUEST", 400);
  }

  try {
    const result = await handleSupabaseSendEmailHook(rawPayload, request.headers);
    return new Response("{}", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-Correlation-Id": result.correlationId,
      },
    });
  } catch (error) {
    if (error instanceof SendEmailHookError) {
      const status = error.code === "SIGNATURE_INVALID" ? 401
        : error.code === "PAYLOAD_INVALID" ? 400
          : 503;
      return response(
        error.code === "CONFIGURATION_INVALID" || error.code === "DELIVERY_FAILED" ? "DELIVERY_UNAVAILABLE" : error.code,
        status,
      );
    }
    return response("DELIVERY_UNAVAILABLE", 503);
  }
}

function response(code: string, status: number): Response {
  return Response.json(
    { error: { http_code: status, message: code } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
