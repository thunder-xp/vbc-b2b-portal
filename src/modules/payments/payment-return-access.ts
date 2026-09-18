const PAYMENT_ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paymentReturnCookieName(paymentAttemptId: string) {
  if (!PAYMENT_ATTEMPT_ID.test(paymentAttemptId)) return null;
  return `nsd_payment_return_${paymentAttemptId.toLowerCase()}`;
}

export const paymentReturnCookieMaxAgeSeconds = 30 * 24 * 60 * 60;
