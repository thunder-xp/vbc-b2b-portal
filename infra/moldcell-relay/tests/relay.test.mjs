import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { afterEach, describe, test } from "node:test";

import { createRelayApplication } from "../src/application.mjs";
import { loadConfig, RELAY_PATH } from "../src/config.mjs";
import { createRelayHttpServer } from "../src/http-server.mjs";
import { createSignature } from "../src/security.mjs";
import { DurableRelayStore } from "../src/store.mjs";

const NOW = Date.UTC(2026, 8, 12, 20, 0, 0);
const TIMESTAMP = Math.floor(NOW / 1_000);
const SECRET = "test-only-relay-secret-at-least-32-characters";
const tempDirectories = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    const resolved = resolve(directory);
    assert.ok(resolved.startsWith(resolve(tmpdir())), "test cleanup must remain inside OS temp");
    rmSync(resolved, { recursive: true, force: true });
  }
});

describe("standalone Moldcell relay", () => {
  test("accepts the exact B2B RelayMoldcellTransport HMAC and locks provider controls", async () => {
    const calls = [];
    const harness = createHarness(async (url, init) => {
      calls.push({ url, init });
      return response({ resultCode: 0, resultDate: "2026-09-12T20:00:01Z", requestId: "request-1" });
    });
    const result = await harness.app(signedRequest(payload()));
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.body).status, "PROVIDER_ACCEPTED");
    assert.equal(calls.length, 1);
    const providerUrl = new URL(calls[0].url);
    assert.equal(providerUrl.origin, "https://wsg.moldcell.md");
    assert.equal(providerUrl.pathname, "/rest/provider/customer/sendSMS");
    assert.equal(providerUrl.searchParams.get("from"), "NSD");
    assert.equal(providerUrl.searchParams.get("template"), "NSD_NOTIFICATION");
    assert.equal(providerUrl.searchParams.get("to"), "37369000000");
    assert.equal(providerUrl.searchParams.get("customText"), "NSD TEST relay");
    assert.equal(calls[0].init.method, "GET");
    harness.close();
  });

  test("matches an independently fixed client-side signature fixture", () => {
    const rawBody = '{"deliveryId":"11111111-1111-4111-8111-111111111111","recipient":"+37369000000","message":"NSD TEST relay","idempotencyKey":"delivery-key","timestamp":1789243200}';
    assert.equal(
      createSignature(SECRET, "1789243200", "22222222-2222-4222-8222-222222222222", rawBody, "delivery-key"),
      "2d2dcebc9edb7818bd114e22151d059493117f7179d939a22e0f6cceecf6f7c7",
    );
  });

  test("rejects missing and invalid signatures without provider access", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); });
    const missing = await harness.app({
      method: "POST", path: RELAY_PATH, body: JSON.stringify(payload()), headers: { "content-type": "application/json" },
    });
    assert.equal(missing.status, 401);
    assert.equal(JSON.parse(missing.body).status, "AUTH_MISSING");
    const invalid = await harness.app(signedRequest(payload(), { signature: "sha256=" + "0".repeat(64) }));
    assert.equal(invalid.status, 401);
    assert.equal(JSON.parse(invalid.body).status, "AUTH_INVALID_SIGNATURE");
    assert.equal(calls, 0);
    harness.close();
  });

  test("rejects expired timestamps and exact-body tampering", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); });
    const expiredPayload = payload({ timestamp: TIMESTAMP - 301 });
    const expired = await harness.app(signedRequest(expiredPayload));
    assert.equal(JSON.parse(expired.body).status, "AUTH_EXPIRED");

    const original = JSON.stringify(payload());
    const tampered = JSON.stringify(payload({ message: "tampered" }));
    const tamperedResult = await harness.app(signedRequest(payload(), { actualBody: tampered, signingBody: original }));
    assert.equal(JSON.parse(tamperedResult.body).status, "AUTH_INVALID_SIGNATURE");
    assert.equal(calls, 0);
    harness.close();
  });

  test("rejects a replayed nonce independently of delivery idempotency", async () => {
    const harness = createHarness(async () => response({ resultCode: 0 }));
    const nonce = "22222222-2222-4222-8222-222222222222";
    assert.equal((await harness.app(signedRequest(payload(), { nonce }))).status, 200);
    const different = payload({
      deliveryId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "different-delivery-key",
    });
    const replay = await harness.app(signedRequest(different, { nonce }));
    assert.equal(replay.status, 409);
    assert.equal(JSON.parse(replay.body).status, "AUTH_REPLAYED");
    harness.close();
  });

  test("returns a durable cached result after store restart and never resubmits", async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; return response({ resultCode: 0, resultMessage: "accepted" }); };
    const directory = temporaryDirectory();
    const databasePath = join(directory, "relay.sqlite");
    const first = createHarness(fetcher, { databasePath });
    const firstResult = await first.app(signedRequest(payload(), { nonce: "22222222-2222-4222-8222-222222222222" }));
    assert.equal(firstResult.status, 200);
    first.close();

    const restarted = createHarness(fetcher, { databasePath });
    const replay = await restarted.app(signedRequest(payload(), { nonce: "33333333-3333-4333-8333-333333333333" }));
    assert.equal(replay.status, 200);
    assert.equal(replay.headers["X-Relay-Replay"], "true");
    assert.equal(calls, 1);
    restarted.close();
  });

  test("rejects idempotency-key reuse with a different canonical request", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); });
    await harness.app(signedRequest(payload(), { nonce: "22222222-2222-4222-8222-222222222222" }));
    const conflict = await harness.app(signedRequest(payload({ message: "Different text" }), {
      nonce: "33333333-3333-4333-8333-333333333333",
    }));
    assert.equal(conflict.status, 409);
    assert.equal(JSON.parse(conflict.body).status, "IDEMPOTENCY_CONFLICT");
    assert.equal(calls, 1);
    harness.close();
  });

  test("rejects malformed and unsupported E.164 recipients without Moldcell access", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); });
    const malformed = await harness.app(signedRequest(payload({ recipient: "069000000" })));
    assert.equal(JSON.parse(malformed.body).status, "INVALID_RECIPIENT");
    const unsupported = await harness.app(signedRequest(payload({ recipient: "+40722123456" }), {
      nonce: "33333333-3333-4333-8333-333333333333",
    }));
    assert.equal(unsupported.status, 422);
    assert.equal(JSON.parse(unsupported.body).status, "NO_SMS_PROVIDER_FOR_DESTINATION");
    assert.equal(calls, 0);
    harness.close();
  });

  test("maps Moldcell result codes 0, 20001, 20012 and unknown without inferring delivery", async (context) => {
    for (const [code, expectedStatus, accepted] of [
      [0, "PROVIDER_ACCEPTED", true],
      [20001, "INVALID_MSISDN", false],
      [20012, "OUTNET_NOT_ALLOWED", false],
      [29999, "UNKNOWN_PROVIDER_FAILURE", false],
    ]) {
      await context.test(String(code), async () => {
        const harness = createHarness(async () => response({ resultCode: code }));
        const result = await harness.app(signedRequest(payload()));
        const body = JSON.parse(result.body);
        assert.equal(body.status, expectedStatus);
        assert.equal(body.accepted, accepted);
        assert.equal(body.resultCode, String(code));
        assert.notEqual(body.status, "DELIVERED");
        harness.close();
      });
    }
  });

  test("maps provider timeout, HTTP 500 and HTTP 429 to retryable failures", async (context) => {
    await context.test("timeout", async () => {
      const fetcher = (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
      const harness = createHarness(fetcher, { timeoutMs: 5 });
      const result = await harness.app(signedRequest(payload()));
      assert.equal(result.status, 504);
      assert.equal(JSON.parse(result.body).status, "RETRYABLE_FAILURE");
      assert.equal(JSON.parse(result.body).providerCode, "TIMEOUT");
      harness.close();
    });
    for (const providerStatus of [500, 429]) {
      await context.test(String(providerStatus), async () => {
        const harness = createHarness(async () => new Response("provider unavailable", { status: providerStatus }));
        const result = await harness.app(signedRequest(payload()));
        assert.equal(result.status, providerStatus === 429 ? 429 : 503);
        assert.equal(JSON.parse(result.body).status, "RETRYABLE_FAILURE");
        harness.close();
      });
    }
  });

  test("enforces body/message bounds and a persisted relay safety rate limit", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); }, { rateLimitPerMinute: 1 });
    const tooLong = await harness.app(signedRequest(payload({ message: "Ж".repeat(71) })));
    assert.equal(JSON.parse(tooLong.body).status, "INVALID_MESSAGE");
    assert.equal((await harness.app(signedRequest(payload(), { nonce: "22222222-2222-4222-8222-222222222222" }))).status, 200);
    const second = payload({
      deliveryId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "second-delivery-key",
    });
    const limited = await harness.app(signedRequest(second, { nonce: "44444444-4444-4444-8444-444444444444" }));
    assert.equal(limited.status, 429);
    assert.equal(JSON.parse(limited.body).status, "RELAY_RATE_LIMITED");
    assert.equal(calls, 1);
    harness.close();
  });

  test("health separates process liveness from provider readiness and sends nothing", async () => {
    let calls = 0;
    const harness = createHarness(async () => { calls += 1; return response({ resultCode: 0 }); });
    const health = await harness.app({ method: "GET", path: "/health", headers: {}, body: "" });
    const body = JSON.parse(health.body);
    assert.equal(health.status, 200);
    assert.equal(body.status, "alive");
    assert.equal(body.ready, true);
    assert.equal(body.providerConfigured, true);
    assert.equal(calls, 0);
    assert.equal(health.body.includes(SECRET), false);
    harness.close();
  });

  test("HTTP runtime listens on loopback and rejects non-exact routes", async () => {
    const harness = createHarness(async () => response({ resultCode: 0 }));
    const server = createRelayHttpServer(harness.app, { maxBodyBytes: 2_048 });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.equal(address.address, "127.0.0.1");
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(health.status, 200);
    const queryVariant = await fetch(`http://127.0.0.1:${address.port}${RELAY_PATH}?unexpected=1`, { method: "POST" });
    assert.equal(queryVariant.status, 404);
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    harness.close();
  });

  test("bundle has no Next, Supabase, legacy route, generic proxy, or production mock switch", () => {
    const files = ["src/application.mjs", "src/config.mjs", "src/moldcell-client.mjs", "src/server.mjs"]
      .map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
      .join("\n");
    assert.doesNotMatch(files, /from ["'](?:next|@supabase)|notification\/moldcell-send|MOCK_PROVIDER|0\.0\.0\.0/);
    assert.doesNotMatch(files, /tls\.DEFAULT_MIN_VERSION|process\.env\.(?:PROVIDER_URL|METHOD)/);
  });
});

function createHarness(fetchImplementation, overrides = {}) {
  const databasePath = overrides.databasePath ?? join(temporaryDirectory(), "relay.sqlite");
  const base = loadConfig({
    RELAY_DATABASE_PATH: databasePath,
    RELAY_KEY_ID: "key-1",
    RELAY_AUTH_SECRET: SECRET,
    RELAY_REPLAY_WINDOW_SECONDS: "300",
    RELAY_IDEMPOTENCY_TTL_SECONDS: "604800",
    RELAY_RATE_LIMIT_PER_MINUTE: String(overrides.rateLimitPerMinute ?? 30),
    MOLDCELL_BASE_URL: "https://wsg.moldcell.md",
    MOLDCELL_PROVIDER_ID: "provider",
    MOLDCELL_CUSTOMER_ID: "customer",
    MOLDCELL_GUID: "test-only-provider-secret",
    MOLDCELL_SENDER: "NSD",
    MOLDCELL_TEMPLATE: "NSD_NOTIFICATION",
    MOLDCELL_TIMEOUT_MS: "1000",
  });
  const config = {
    ...base,
    moldcell: { ...base.moldcell, timeoutMs: overrides.timeoutMs ?? base.moldcell.timeoutMs },
  };
  const store = new DurableRelayStore({
    databasePath,
    rateLimitPerMinute: config.rateLimitPerMinute,
    idempotencyTtlSeconds: config.idempotencyTtlSeconds,
    replayWindowSeconds: config.replayWindowSeconds,
    now: () => NOW,
  });
  return {
    app: createRelayApplication({ config, store, fetchImplementation, now: () => NOW, logger: () => undefined }),
    close: () => store.close(),
  };
}

function payload(overrides = {}) {
  return {
    deliveryId: "11111111-1111-4111-8111-111111111111",
    recipient: "+37369000000",
    message: "NSD TEST relay",
    idempotencyKey: "delivery-key",
    timestamp: TIMESTAMP,
    ...overrides,
  };
}

function signedRequest(value, options = {}) {
  const nonce = options.nonce ?? "22222222-2222-4222-8222-222222222222";
  const body = options.actualBody ?? JSON.stringify(value);
  const signingBody = options.signingBody ?? body;
  const idempotencyKey = options.headerIdempotencyKey ?? value.idempotencyKey;
  const bodyHash = createHash("sha256").update(signingBody).digest("hex");
  const signature = options.signature ?? `sha256=${createHmac("sha256", SECRET)
    .update([String(value.timestamp), nonce, bodyHash, idempotencyKey].join("\n"))
    .digest("hex")}`;
  return {
    method: "POST",
    path: RELAY_PATH,
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-correlation-id": value.deliveryId,
      "x-nsd-key-id": "key-1",
      "x-nsd-timestamp": String(value.timestamp),
      "x-nsd-nonce": nonce,
      "x-nsd-signature": signature,
    },
    body,
  };
}

function response(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "nsd-relay-test-"));
  tempDirectories.push(directory);
  return directory;
}
