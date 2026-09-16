import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { authenticateMaibCallback } from "../providers/maib/maib-callback-auth";

const key = "bank-confirmed-test-key";
const environment = { MAIB_SIGNATURE_KEY: key, MAIB_CALLBACK_MAX_SKEW_SECONDS: "300" };
const now = 1_789_560_000_000;
const body = Buffer.from('{"checkoutId":"raw-body-order-matters","amount":10.25}', "utf8");

describe("MAIB raw callback authentication", () => {
  it("verifies the exact raw bytes plus Unix-millisecond timestamp", () => {
    const timestamp = String(now);
    expect(authenticateMaibCallback(body, sign(body, timestamp), timestamp, environment, now)).toEqual({ valid: true, timestampMs: now });
    const reformatted = Buffer.from('{"amount":10.25,"checkoutId":"raw-body-order-matters"}', "utf8");
    expect(authenticateMaibCallback(reformatted, sign(body, timestamp), timestamp, environment, now)).toEqual({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it.each([
    [null, String(now), "MISSING_SIGNATURE"],
    ["sha256=not-base64", String(now), "MALFORMED_SIGNATURE"],
    [sign(body, String(now)), null, "MISSING_TIMESTAMP"],
    [sign(body, String(now)), "123", "MALFORMED_TIMESTAMP"],
  ] as const)("rejects malformed authentication inputs", (signature, timestamp, reason) => {
    expect(authenticateMaibCallback(body, signature, timestamp, environment, now)).toEqual({ valid: false, reason });
  });

  it("rejects stale and future timestamps outside the merchant-controlled 300-second window", () => {
    for (const timestamp of [String(now - 300_001), String(now + 300_001)]) {
      expect(authenticateMaibCallback(body, sign(body, timestamp), timestamp, environment, now)).toEqual({ valid: false, reason: "STALE_TIMESTAMP" });
    }
    for (const timestamp of [String(now - 300_000), String(now + 300_000)]) {
      expect(authenticateMaibCallback(body, sign(body, timestamp), timestamp, environment, now).valid).toBe(true);
    }
  });

  it("defaults securely to 300 seconds and rejects invalid configuration", () => {
    const timestamp = String(now);
    expect(authenticateMaibCallback(body, sign(body, timestamp), timestamp, { MAIB_SIGNATURE_KEY: key }, now).valid).toBe(true);
    expect(authenticateMaibCallback(body, sign(body, timestamp), timestamp, { MAIB_SIGNATURE_KEY: key, MAIB_CALLBACK_MAX_SKEW_SECONDS: "0" }, now)).toEqual({ valid: false, reason: "CONFIGURATION_ERROR" });
  });
});

function sign(rawBody: Uint8Array, timestamp: string) {
  return `sha256=${createHmac("sha256", key).update(rawBody).update(`.${timestamp}`, "utf8").digest("base64")}`;
}
