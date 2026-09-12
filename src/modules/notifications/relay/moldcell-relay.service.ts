import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { createMoldcellSmsProvider } from "../gateway/moldcell-sms.provider";
import { maskPhone, normalizeE164Phone } from "../gateway/sms-phone";
import { NotificationDeliveryError } from "../gateway/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:._-]{8,200}$/;
const SIGNATURE = /^sha256=([0-9a-f]{64})$/;
const MAX_BODY_BYTES = 2_048;
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;

export type RelayCachedResponse = Readonly<{ status: number; body: string }>;

export interface MoldcellRelayReplayStore {
  claim(input: Readonly<{
    keyId: string;
    nonce: string;
    idempotencyKey: string;
    fingerprint: string;
    expiresAt: number;
  }>): "CLAIMED" | "REPLAY" | "CONFLICT" | "RATE_LIMITED";
  complete(idempotencyKey: string, response: RelayCachedResponse): void;
  cached(idempotencyKey: string): RelayCachedResponse | null;
}

type StoredRequest = {
  fingerprint: string;
  expiresAt: number;
  response: RelayCachedResponse | null;
};

export class BoundedMemoryMoldcellRelayStore implements MoldcellRelayReplayStore {
  private readonly requests = new Map<string, StoredRequest>();
  private readonly nonces = new Map<string, number>();
  private readonly rateWindows = new Map<string, { minute: number; count: number }>();

  constructor(
    private readonly rateLimitPerMinute = DEFAULT_RATE_LIMIT_PER_MINUTE,
    private readonly now: () => number = Date.now,
  ) {}

  claim(input: {
    keyId: string;
    nonce: string;
    idempotencyKey: string;
    fingerprint: string;
    expiresAt: number;
  }): "CLAIMED" | "REPLAY" | "CONFLICT" | "RATE_LIMITED" {
    this.prune();
    if (this.nonces.has(input.nonce)) return "REPLAY";
    const existing = this.requests.get(input.idempotencyKey);
    if (existing) return existing.fingerprint === input.fingerprint ? "REPLAY" : "CONFLICT";

    const minute = Math.floor(this.now() / 60_000);
    const rate = this.rateWindows.get(input.keyId);
    if (rate?.minute === minute && rate.count >= this.rateLimitPerMinute) return "RATE_LIMITED";
    this.rateWindows.set(input.keyId, { minute, count: rate?.minute === minute ? rate.count + 1 : 1 });
    this.nonces.set(input.nonce, input.expiresAt);
    this.requests.set(input.idempotencyKey, { fingerprint: input.fingerprint, expiresAt: input.expiresAt, response: null });
    return "CLAIMED";
  }

  complete(idempotencyKey: string, response: RelayCachedResponse): void {
    const request = this.requests.get(idempotencyKey);
    if (request) request.response = response;
  }

  cached(idempotencyKey: string): RelayCachedResponse | null {
    return this.requests.get(idempotencyKey)?.response ?? null;
  }

  private prune(): void {
    const now = Math.floor(this.now() / 1_000);
    for (const [key, value] of this.requests) if (value.expiresAt < now) this.requests.delete(key);
    for (const [key, expiresAt] of this.nonces) if (expiresAt < now) this.nonces.delete(key);
    for (const [key, value] of this.rateWindows) if (value.minute < Math.floor(this.now() / 60_000)) this.rateWindows.delete(key);
  }
}

export function createMoldcellRelayHandler(options: Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  store: MoldcellRelayReplayStore;
  fetchImplementation?: typeof fetch;
  now?: () => number;
}>) {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  return async function handle(request: Request): Promise<Response> {
    const startedAt = performance.now();
    if (request.method !== "POST" || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
    const raw = await readBoundedBody(request);
    if (raw === null) return json({ error: "INVALID_REQUEST" }, 400);
    const authenticated = authenticateRelayRequest(request.headers, raw, environment, now);
    if (!authenticated.ok) return json({ error: authenticated.code }, authenticated.status);
    const payload = parsePayload(raw, authenticated.timestamp);
    if (!payload) return json({ error: "INVALID_REQUEST" }, 400);
    if (payload.idempotencyKey !== authenticated.idempotencyKey) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const fingerprint = createHash("sha256").update(raw).digest("hex");
    const claim = options.store.claim({
      keyId: authenticated.keyId,
      nonce: authenticated.nonce,
      idempotencyKey: payload.idempotencyKey,
      fingerprint,
      expiresAt: authenticated.timestamp + authenticated.replayWindowSeconds,
    });
    if (claim === "CONFLICT") return json({ error: "IDEMPOTENCY_CONFLICT" }, 409);
    if (claim === "RATE_LIMITED") return json({ error: "RELAY_RATE_LIMITED" }, 429);
    if (claim === "REPLAY") {
      const cached = options.store.cached(payload.idempotencyKey);
      return cached ? new Response(cached.body, { status: cached.status, headers: jsonHeaders({ "X-Relay-Replay": "true" }) })
        : json({ error: "REQUEST_IN_PROGRESS" }, 409);
    }

    try {
      const provider = createMoldcellSmsProvider({ ...environment, MOLDCELL_TRANSPORT_MODE: "direct" }, options.fetchImplementation);
      const result = await provider.send({
        deliveryId: payload.deliveryId,
        recipient: payload.recipient,
        message: payload.message,
        locale: "ru",
        idempotencyKey: payload.idempotencyKey,
      });
      const response = JSON.stringify({
        resultCode: result.providerCode,
        resultDate: result.providerTimestamp,
        resultMessage: result.providerMessage,
        providerRequestId: result.providerReference,
      });
      const cached = { status: 200, body: response };
      options.store.complete(payload.idempotencyKey, cached);
      console.info({
        event: "moldcell_relay_attempt_completed",
        deliveryId: payload.deliveryId,
        provider: "moldcell",
        transport: "DIRECT",
        recipient: maskPhone(payload.recipient),
        providerCode: result.providerCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      return new Response(response, { status: 200, headers: jsonHeaders() });
    } catch (error) {
      const normalized = error instanceof NotificationDeliveryError ? error : new NotificationDeliveryError("unavailable", true);
      const status = normalized.category === "configuration" ? 503
        : normalized.category === "timeout" ? 504
          : normalized.category === "authentication" ? 502 : 502;
      const response = JSON.stringify({ error: normalized.category.toUpperCase() });
      options.store.complete(payload.idempotencyKey, { status, body: response });
      console.warn({
        event: "moldcell_relay_attempt_failed",
        deliveryId: payload.deliveryId,
        provider: "moldcell",
        transport: "DIRECT",
        recipient: maskPhone(payload.recipient),
        providerCode: normalized.providerCode,
        errorCategory: normalized.category,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      return new Response(response, { status, headers: jsonHeaders() });
    }
  };
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (announced > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  return new TextEncoder().encode(raw).byteLength <= MAX_BODY_BYTES ? raw : null;
}

function parsePayload(raw: string, signedTimestamp: number) {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "deliveryId,idempotencyKey,message,recipient,timestamp") return null;
    const rawRecipient = typeof record.recipient === "string" ? record.recipient : "";
    const recipient = normalizeE164Phone(rawRecipient);
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (!UUID.test(String(record.deliveryId)) || !IDEMPOTENCY_KEY.test(String(record.idempotencyKey))
      || !recipient?.startsWith("+373") || recipient !== rawRecipient || Number(record.timestamp) !== signedTimestamp
      || !message || [...message].length > 160
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) return null;
    return {
      deliveryId: String(record.deliveryId),
      recipient,
      message,
      idempotencyKey: String(record.idempotencyKey),
    };
  } catch {
    return null;
  }
}

function authenticateRelayRequest(
  headers: Headers,
  raw: string,
  environment: Readonly<Record<string, string | undefined>>,
  now: () => number,
): { ok: true; keyId: string; nonce: string; idempotencyKey: string; timestamp: number; replayWindowSeconds: number } |
  { ok: false; code: string; status: number } {
  const configuredKeyId = environment.MOLDCELL_RELAY_KEY_ID?.trim() ?? "";
  const secret = environment.MOLDCELL_RELAY_AUTH_SECRET?.trim() ?? "";
  const keyId = headers.get("x-nsd-key-id") ?? "";
  const nonce = headers.get("x-nsd-nonce") ?? "";
  const timestampText = headers.get("x-nsd-timestamp") ?? "";
  const idempotencyKey = headers.get("idempotency-key") ?? "";
  const signature = headers.get("x-nsd-signature")?.match(SIGNATURE)?.[1] ?? "";
  const timestamp = Number(timestampText);
  const replayWindowSeconds = boundedInteger(environment.MOLDCELL_RELAY_REPLAY_WINDOW_SECONDS, DEFAULT_REPLAY_WINDOW_SECONDS, 60, 900);
  if (!configuredKeyId || secret.length < 32 || keyId !== configuredKeyId || !NONCE.test(nonce)
    || !IDEMPOTENCY_KEY.test(idempotencyKey) || !Number.isInteger(timestamp)
    || Math.abs(Math.floor(now() / 1_000) - timestamp) > replayWindowSeconds || !signature) {
    return { ok: false, code: "UNAUTHORIZED", status: 401 };
  }
  const expected = createHmacHex(secret, timestampText, nonce, raw, idempotencyKey);
  const valid = timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  return valid ? { ok: true, keyId, nonce, idempotencyKey, timestamp, replayWindowSeconds }
    : { ok: false, code: "UNAUTHORIZED", status: 401 };
}

function createHmacHex(secret: string, timestamp: string, nonce: string, raw: string, idempotencyKey: string): string {
  const bodyHash = createHash("sha256").update(raw).digest("hex");
  return createHmac("sha256", secret)
    .update([timestamp, nonce, bodyHash, idempotencyKey].join("\n"))
    .digest("hex");
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders() });
}

function jsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { "Cache-Control": "no-store", "Content-Type": "application/json", ...extra };
}
