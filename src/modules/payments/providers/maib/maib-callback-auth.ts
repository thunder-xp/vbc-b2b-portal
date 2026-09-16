import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type MaibCallbackAuthenticationResult =
  | Readonly<{ valid: true; timestampMs: number }>
  | Readonly<{ valid: false; reason: "MISSING_SIGNATURE" | "MALFORMED_SIGNATURE" | "MISSING_TIMESTAMP" | "MALFORMED_TIMESTAMP" | "STALE_TIMESTAMP" | "INVALID_SIGNATURE" | "CONFIGURATION_ERROR" }>;

const SIGNATURE = /^sha256=([A-Za-z0-9+/]{43}=)$/;
const TIMESTAMP = /^\d{13}$/;

export function authenticateMaibCallback(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  timestampHeader: string | null,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nowMs = Date.now(),
): MaibCallbackAuthenticationResult {
  const key = environment.MAIB_SIGNATURE_KEY?.trim();
  const configuredSkew = environment.MAIB_CALLBACK_MAX_SKEW_SECONDS?.trim() || "300";
  const maxSkewSeconds = Number(configuredSkew);
  if (!key || !Number.isInteger(maxSkewSeconds) || maxSkewSeconds <= 0 || maxSkewSeconds > 3600) return { valid: false, reason: "CONFIGURATION_ERROR" };
  if (!signatureHeader) return { valid: false, reason: "MISSING_SIGNATURE" };
  const signatureMatch = SIGNATURE.exec(signatureHeader);
  if (!signatureMatch) return { valid: false, reason: "MALFORMED_SIGNATURE" };
  if (!timestampHeader) return { valid: false, reason: "MISSING_TIMESTAMP" };
  if (!TIMESTAMP.test(timestampHeader)) return { valid: false, reason: "MALFORMED_TIMESTAMP" };
  const timestampMs = Number(timestampHeader);
  if (!Number.isSafeInteger(timestampMs)) return { valid: false, reason: "MALFORMED_TIMESTAMP" };
  if (Math.abs(nowMs - timestampMs) > maxSkewSeconds * 1000) return { valid: false, reason: "STALE_TIMESTAMP" };

  const received = Buffer.from(signatureMatch[1]!, "base64");
  if (received.byteLength !== 32 || received.toString("base64") !== signatureMatch[1]) return { valid: false, reason: "MALFORMED_SIGNATURE" };
  const expected = createHmac("sha256", key).update(rawBody).update(`.${timestampHeader}`, "utf8").digest();
  return timingSafeEqual(received, expected)
    ? { valid: true, timestampMs }
    : { valid: false, reason: "INVALID_SIGNATURE" };
}
