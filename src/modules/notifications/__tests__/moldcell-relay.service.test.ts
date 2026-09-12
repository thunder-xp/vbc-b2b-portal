import { createHash, createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BoundedMemoryMoldcellRelayStore,
  createMoldcellRelayHandler,
} from "../relay/moldcell-relay.service";

const now = Date.UTC(2026, 8, 12, 20, 0, 0);
const timestamp = Math.floor(now / 1_000);
const secret = "test-only-relay-secret-at-least-32";
const environment = {
  MOLDCELL_RELAY_KEY_ID: "key-1",
  MOLDCELL_RELAY_AUTH_SECRET: secret,
  MOLDCELL_BASE_URL: "https://wsg.moldcell.md",
  MOLDCELL_PROVIDER_ID: "provider",
  MOLDCELL_CUSTOMER_ID: "customer",
  MOLDCELL_GUID: "test-only-provider-secret",
};

describe("secure portable Moldcell relay", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("rejects browser/unsigned calls before provider access", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createMoldcellRelayHandler({
      environment,
      store: new BoundedMemoryMoldcellRelayStore(30, () => now),
      fetchImplementation: fetcher,
      now: () => now,
    });
    const response = await handler(new Request("https://relay.example/internal/omnichannel/v1/sms/moldcell", {
      method: "POST", body: JSON.stringify(payload()), headers: { "Content-Type": "application/json" },
    }));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts one signed request and locks sender/template/provider URL server-side", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ resultCode: 0 }), { status: 200 }));
    const handler = createMoldcellRelayHandler({
      environment,
      store: new BoundedMemoryMoldcellRelayStore(30, () => now),
      fetchImplementation: fetcher,
      now: () => now,
    });
    const response = await handler(signedRequest(payload()));
    expect(response.status).toBe(200);
    const providerUrl = new URL(String(fetcher.mock.calls[0]![0]));
    expect(providerUrl.origin).toBe("https://wsg.moldcell.md");
    expect(providerUrl.searchParams.get("from")).toBe("NSD");
    expect(providerUrl.searchParams.get("template")).toBe("NSD_NOTIFICATION");
    expect(providerUrl.searchParams.get("to")).toBe("37369000000");
  });

  it("rejects tampering, expired timestamps and caller-controlled provider fields", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const handler = createMoldcellRelayHandler({
      environment,
      store: new BoundedMemoryMoldcellRelayStore(30, () => now),
      fetchImplementation: fetcher,
      now: () => now,
    });
    const tampered = signedRequest(payload(), { signBody: JSON.stringify(payload()), actualBody: JSON.stringify({ ...payload(), message: "changed" }) });
    expect((await handler(tampered)).status).toBe(401);
    expect((await handler(signedRequest({ ...payload(), timestamp: timestamp - 301 }))).status).toBe(401);
    expect((await handler(signedRequest({ ...payload(), sender: "ATTACKER" } as never))).status).toBe(400);
    const mismatchedKey = signedRequest(payload(), { headerIdempotencyKey: "another-key" });
    expect((await handler(mismatchedKey)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("replays a completed idempotent response without a second provider call", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ resultCode: 0 }), { status: 200 }));
    const store = new BoundedMemoryMoldcellRelayStore(30, () => now);
    const handler = createMoldcellRelayHandler({ environment, store, fetchImplementation: fetcher, now: () => now });
    const first = await handler(signedRequest(payload(), { nonce: "22222222-2222-4222-8222-222222222222" }));
    const replay = await handler(signedRequest(payload(), { nonce: "33333333-3333-4333-8333-333333333333" }));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-relay-replay")).toBe("true");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects nonce replay, idempotency conflicts, malformed phones and oversized input", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ resultCode: 0 }), { status: 200 }));
    const store = new BoundedMemoryMoldcellRelayStore(30, () => now);
    const handler = createMoldcellRelayHandler({ environment, store, fetchImplementation: fetcher, now: () => now });
    const nonce = "22222222-2222-4222-8222-222222222222";
    expect((await handler(signedRequest(payload(), { nonce }))).status).toBe(200);
    expect((await handler(signedRequest({ ...payload(), idempotencyKey: "different-key" }, { nonce }))).status).toBe(409);
    expect((await handler(signedRequest({ ...payload(), message: "different" }, { nonce: "33333333-3333-4333-8333-333333333333" }))).status).toBe(409);
    expect((await handler(signedRequest({ ...payload(), recipient: "069000000" }, { nonce: "44444444-4444-4444-8444-444444444444" }))).status).toBe(400);
    expect((await handler(signedRequest({ ...payload(), message: "x".repeat(161) }, { nonce: "55555555-5555-4555-8555-555555555555" }))).status).toBe(400);
  });

  it("applies a bounded relay safety rate limit", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ resultCode: 0 }), { status: 200 }));
    const handler = createMoldcellRelayHandler({
      environment,
      store: new BoundedMemoryMoldcellRelayStore(1, () => now),
      fetchImplementation: fetcher,
      now: () => now,
    });
    expect((await handler(signedRequest(payload(), { nonce: "22222222-2222-4222-8222-222222222222" }))).status).toBe(200);
    const second = { ...payload(), deliveryId: "66666666-6666-4666-8666-666666666666", idempotencyKey: "second-delivery-key" };
    expect((await handler(signedRequest(second, { nonce: "33333333-3333-4333-8333-333333333333" }))).status).toBe(429);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

function payload() {
  return {
    deliveryId: "11111111-1111-4111-8111-111111111111",
    recipient: "+37369000000",
    message: "NSD TEST: relay acceptance",
    idempotencyKey: "delivery-key",
    timestamp,
  };
}

function signedRequest(
  value: Record<string, unknown>,
  options: { nonce?: string; signBody?: string; actualBody?: string; headerIdempotencyKey?: string } = {},
) {
  const nonce = options.nonce ?? "11111111-1111-4111-8111-111111111111";
  const body = options.actualBody ?? JSON.stringify(value);
  const signBody = options.signBody ?? body;
  const bodyHash = createHash("sha256").update(signBody).digest("hex");
  const headerIdempotencyKey = options.headerIdempotencyKey ?? String(value.idempotencyKey);
  const signature = createHmac("sha256", secret)
    .update([String(value.timestamp), nonce, bodyHash, headerIdempotencyKey].join("\n"))
    .digest("hex");
  return new Request("https://relay.example/internal/omnichannel/v1/sms/moldcell", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": headerIdempotencyKey,
      "X-NSD-Key-Id": "key-1",
      "X-NSD-Timestamp": String(value.timestamp),
      "X-NSD-Nonce": nonce,
      "X-NSD-Signature": `sha256=${signature}`,
    },
    body,
  });
}
