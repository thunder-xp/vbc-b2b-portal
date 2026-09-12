import { performance } from "node:perf_hooks";

import { HEALTH_PATH, RELAY_PATH } from "./config.mjs";
import { MoldcellClient } from "./moldcell-client.mjs";
import {
  authenticateRequest,
  canonicalRequestFingerprint,
  isIdempotencyKey,
  isUuid,
} from "./security.mjs";

const E164 = /^\+[1-9]\d{7,14}$/;
const MOLDCELL_E164 = /^\+373\d{8}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function createRelayApplication({ config, store, fetchImplementation = fetch, now = Date.now, logger = createLogger() }) {
  const provider = new MoldcellClient(config.moldcell, fetchImplementation);

  return async function handle(request) {
    if (request.path === HEALTH_PATH && request.method === "GET") return health(config);
    if (request.path !== RELAY_PATH) return json({ error: "NOT_FOUND" }, 404);
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST" });
    if (contentType(request.headers).split(";", 1)[0].trim() !== "application/json") {
      return relayError(null, "INVALID_CONTENT_TYPE", 415);
    }
    if (Buffer.byteLength(request.body, "utf8") > config.maxBodyBytes) {
      return relayError(null, "REQUEST_BODY_TOO_LARGE", 413);
    }
    if (!config.authenticationConfigured || !config.providerConfigured) {
      return relayError(null, "SERVICE_NOT_READY", 503);
    }

    const authenticated = authenticateRequest(request.headers, request.body, config, now);
    if (!authenticated.ok) return relayError(null, authenticated.code, authenticated.status);
    const parsed = parsePayload(request.body, config.maxSmsCharacters);
    if (!parsed.ok) return relayError(authenticated.correlationId, parsed.code, parsed.status);
    const payload = parsed.payload;
    if (payload.idempotencyKey !== authenticated.idempotencyKey
      || payload.deliveryId !== authenticated.correlationId
      || payload.timestamp !== authenticated.timestamp) {
      return relayError(payload.deliveryId, "AUTH_CONTRACT_MISMATCH", 401);
    }

    let claim;
    try {
      claim = store.claim({
        keyId: authenticated.keyId,
        nonce: authenticated.nonce,
        idempotencyKey: payload.idempotencyKey,
        deliveryId: payload.deliveryId,
        fingerprint: canonicalRequestFingerprint(payload),
      });
    } catch {
      logger({
        timestamp: new Date(now()).toISOString(),
        event: "relay_store_claim_failed",
        deliveryId: payload.deliveryId,
        provider: "moldcell",
        status: "RELAY_STORE_UNAVAILABLE",
      });
      return relayError(payload.deliveryId, "RELAY_STORE_UNAVAILABLE", 503);
    }
    if (claim.kind === "NONCE_REPLAY") return relayError(payload.deliveryId, "AUTH_REPLAYED", 409);
    if (claim.kind === "CONFLICT") return relayError(payload.deliveryId, "IDEMPOTENCY_CONFLICT", 409);
    if (claim.kind === "IN_PROGRESS") return relayError(payload.deliveryId, "REQUEST_IN_PROGRESS", 503);
    if (claim.kind === "RATE_LIMITED") {
      return relayError(payload.deliveryId, "RELAY_RATE_LIMITED", 429, { "Retry-After": "60" });
    }
    if (claim.kind === "CACHED") {
      return { ...claim.response, headers: responseHeaders({ "X-Relay-Replay": "true" }) };
    }

    const startedAt = performance.now();
    const result = await provider.send(payload.recipient, payload.message);
    const response = relayResult(payload.deliveryId, result);
    try {
      store.complete(claim.keyHash, response);
    } catch {
      logger({
        timestamp: new Date(now()).toISOString(),
        event: "relay_store_completion_failed",
        deliveryId: payload.deliveryId,
        provider: "moldcell",
        recipient: maskRecipient(payload.recipient),
        providerCode: result.providerCode,
        status: "INDETERMINATE_PROVIDER_OUTCOME",
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      return relayError(payload.deliveryId, "INDETERMINATE_PROVIDER_OUTCOME", 503);
    }
    logger({
      timestamp: new Date(now()).toISOString(),
      event: "moldcell_relay_attempt_completed",
      deliveryId: payload.deliveryId,
      provider: "moldcell",
      recipient: maskRecipient(payload.recipient),
      providerCode: result.providerCode,
      status: result.status,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return { ...response, headers: responseHeaders() };
  };
}

function health(config) {
  const ready = config.authenticationConfigured && config.providerConfigured;
  return json({
    service: "nsd-sms-relay",
    status: "alive",
    version: config.version,
    ready,
    authenticationConfigured: config.authenticationConfigured,
    provider: "moldcell",
    providerConfigured: config.providerConfigured,
    transport: "direct",
  }, 200);
}

function parsePayload(rawBody, maxSmsCharacters) {
  try {
    const value = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("INVALID_REQUEST");
    if (Object.keys(value).sort().join(",") !== "deliveryId,idempotencyKey,message,recipient,timestamp") {
      return invalid("INVALID_REQUEST");
    }
    const deliveryId = typeof value.deliveryId === "string" ? value.deliveryId : "";
    const idempotencyKey = typeof value.idempotencyKey === "string" ? value.idempotencyKey : "";
    const recipient = typeof value.recipient === "string" ? value.recipient : "";
    const message = typeof value.message === "string" ? value.message : "";
    const timestamp = value.timestamp;
    if (!isUuid(deliveryId) || !isIdempotencyKey(idempotencyKey) || !Number.isInteger(timestamp)) {
      return invalid("INVALID_REQUEST");
    }
    if (!E164.test(recipient)) return invalid("INVALID_RECIPIENT");
    if (!MOLDCELL_E164.test(recipient)) return invalid("NO_SMS_PROVIDER_FOR_DESTINATION", 422);
    if (!message || message !== message.trim() || [...message].length > maxSmsCharacters || CONTROL_CHARACTERS.test(message)) {
      return invalid("INVALID_MESSAGE");
    }
    return { ok: true, payload: { deliveryId, idempotencyKey, recipient, message, timestamp } };
  } catch {
    return invalid("INVALID_REQUEST");
  }
}

function relayResult(deliveryId, result) {
  return {
    status: result.httpStatus,
    body: JSON.stringify({
      deliveryId,
      provider: "moldcell",
      status: result.status,
      accepted: result.accepted,
      providerCode: result.providerCode,
      providerMessage: result.providerMessage,
      providerTimestamp: result.providerTimestamp,
      resultCode: result.providerCode,
      resultDate: result.providerTimestamp,
      resultMessage: result.providerMessage,
      providerRequestId: result.providerRequestId,
    }),
  };
}

function relayError(deliveryId, code, status, extraHeaders = {}) {
  return json({
    deliveryId,
    provider: "moldcell",
    status: code,
    accepted: false,
    providerCode: code,
    providerMessage: null,
    providerTimestamp: null,
    resultCode: code,
    resultDate: null,
    resultMessage: null,
    providerRequestId: null,
  }, status, extraHeaders);
}

function json(body, status, extraHeaders = {}) {
  return { status, body: JSON.stringify(body), headers: responseHeaders(extraHeaders) };
}

function responseHeaders(extraHeaders = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  };
}

function contentType(headers) {
  const value = headers["content-type"] ?? headers["Content-Type"] ?? "";
  return Array.isArray(value) ? String(value[0] ?? "").toLowerCase() : String(value).toLowerCase();
}

function invalid(code, status = 400) {
  return { ok: false, code, status };
}

function maskRecipient(recipient) {
  return `${recipient.slice(0, 4)}*****${recipient.slice(-2)}`;
}

function createLogger() {
  return (entry) => console.log(JSON.stringify(entry));
}
