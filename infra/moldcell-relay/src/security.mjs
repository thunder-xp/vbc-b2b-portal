import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,200}$/;
const SIGNATURE = /^sha256=([0-9a-f]{64})$/;

export function authenticateRequest(headers, rawBody, config, now = Date.now) {
  const keyId = header(headers, "x-nsd-key-id");
  const timestampText = header(headers, "x-nsd-timestamp");
  const nonce = header(headers, "x-nsd-nonce");
  const idempotencyKey = header(headers, "idempotency-key");
  const correlationId = header(headers, "x-correlation-id");
  const signatureHeader = header(headers, "x-nsd-signature");

  if (![keyId, timestampText, nonce, idempotencyKey, correlationId, signatureHeader].every(Boolean)) {
    return failure("AUTH_MISSING");
  }
  if (!config.authenticationConfigured || keyId !== config.keyId || !UUID.test(nonce)
    || !UUID.test(correlationId) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return failure("AUTH_INVALID_SIGNATURE");
  }

  const timestamp = Number(timestampText);
  const currentSeconds = Math.floor(now() / 1_000);
  if (!Number.isInteger(timestamp) || Math.abs(currentSeconds - timestamp) > config.replayWindowSeconds) {
    return failure("AUTH_EXPIRED");
  }

  const receivedHex = signatureHeader.match(SIGNATURE)?.[1];
  if (!receivedHex) return failure("AUTH_INVALID_SIGNATURE");
  const expectedHex = createSignature(config.relaySecret, timestampText, nonce, rawBody, idempotencyKey);
  const valid = timingSafeEqual(Buffer.from(receivedHex, "hex"), Buffer.from(expectedHex, "hex"));
  return valid
    ? { ok: true, keyId, timestamp, nonce, idempotencyKey, correlationId }
    : failure("AUTH_INVALID_SIGNATURE");
}

export function createSignature(secret, timestamp, nonce, rawBody, idempotencyKey) {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return createHmac("sha256", secret)
    .update([String(timestamp), nonce, bodyHash, idempotencyKey].join("\n"))
    .digest("hex");
}

export function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalRequestFingerprint(payload) {
  return hashValue(JSON.stringify({
    deliveryId: payload.deliveryId,
    recipient: payload.recipient,
    message: payload.message,
  }));
}

export function isUuid(value) {
  return UUID.test(value);
}

export function isIdempotencyKey(value) {
  return IDEMPOTENCY_KEY.test(value);
}

function header(headers, name) {
  if (headers instanceof Headers) return headers.get(name)?.trim() ?? "";
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
}

function failure(code) {
  return { ok: false, code, status: 401 };
}
