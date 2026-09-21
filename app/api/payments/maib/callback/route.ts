import { createMaibReviewPaymentService, createRetailPaymentService, maibReviewProviderEnvironment } from "@/src/modules/payments/server";
import { authenticateMaibCallback } from "@/src/modules/payments/providers/maib/maib-callback-auth";
import { parseMaibCallback } from "@/src/modules/payments/providers/maib/maib-callback";

export const dynamic = "force-dynamic";

const MAX_CALLBACK_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_CALLBACK_BYTES) return empty(413);

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_CALLBACK_BYTES) return empty(400);

  const publicAuthentication = authenticateMaibCallback(
    rawBody,
    request.headers.get("x-signature"),
    request.headers.get("x-signature-timestamp"),
  );
  const reviewAuthentication = publicAuthentication.valid ? null : authenticateMaibCallback(
    rawBody,
    request.headers.get("x-signature"),
    request.headers.get("x-signature-timestamp"),
    maibReviewProviderEnvironment(),
  );
  const checkoutChannel = publicAuthentication.valid ? "public" : reviewAuthentication?.valid ? "maib_review" : null;
  if (!checkoutChannel) {
    if (!publicAuthentication.valid && publicAuthentication.reason === "CONFIGURATION_ERROR"
      && reviewAuthentication && !reviewAuthentication.valid && reviewAuthentication.reason === "CONFIGURATION_ERROR") {
      console.error({ event: "maib_callback_configuration_error" });
      return empty(503);
    }
    const reason = !publicAuthentication.valid ? publicAuthentication.reason : "INVALID_SIGNATURE";
    console.warn({ event: "maib_callback_rejected", reason });
    return empty(401);
  }

  const evidence = parseMaibCallback(rawBody);
  if (!evidence) return empty(400);

  try {
    const paymentService = checkoutChannel === "maib_review"
      ? createMaibReviewPaymentService()
      : createRetailPaymentService();
    const result = await paymentService.confirmMaibCallback(evidence, checkoutChannel);
    if (result.outcome === "PAID" || result.outcome === "DUPLICATE" || result.outcome === "NON_PAID") return empty(200);
    if (result.outcome === "PAID_PENDING_ACTIVATION") return empty(503);
    return empty(result.outcome === "UNKNOWN_CHECKOUT" ? 404 : 422);
  } catch (error) {
    console.error({ event: "maib_callback_processing_failed", errorType: error instanceof Error ? error.name : typeof error });
    return empty(503);
  }
}

function empty(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
