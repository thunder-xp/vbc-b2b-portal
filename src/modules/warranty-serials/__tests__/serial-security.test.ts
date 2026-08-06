import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashSerial, maskSerial, normalizeSerial, protectSerial, revealSerial, WarrantySerialValidationError } from "../serial-security";

describe("warranty serial security", () => {
  beforeEach(() => {
    process.env.WARRANTY_SERIAL_HASH_SECRET = "h".repeat(48);
    process.env.WARRANTY_SERIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    delete process.env.WARRANTY_SERIAL_HASH_SECRET;
    delete process.env.WARRANTY_SERIAL_ENCRYPTION_KEY;
  });

  it("normalizes case, Unicode, and formatting spaces while preserving separators", () => {
    expect(normalizeSerial("  ab-12 / cd  ")).toBe("AB-12/CD");
    expect(normalizeSerial("ＡＢ-１２")).toBe("AB-12");
  });

  it("rejects empty and malformed values", () => {
    expect(() => normalizeSerial("   ")).toThrow(WarrantySerialValidationError);
    expect(() => normalizeSerial("AB*12")).toThrow(WarrantySerialValidationError);
  });

  it("uses keyed deterministic lookup hashes and authenticated encryption", () => {
    const normalized = normalizeSerial("ab-12/cd");
    const hash = hashSerial(normalized);
    const protectedValue = protectSerial(normalized);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe("AB-12/CD");
    expect(protectedValue).not.toContain(normalized);
    expect(revealSerial(protectedValue)).toBe(normalized);
    expect(maskSerial(normalized)).toBe("AB-***/CD");
  });
});
