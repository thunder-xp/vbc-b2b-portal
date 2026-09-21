import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAIB_REVIEW_COOKIE = "novotech_maib_review";
export const MAIB_REVIEW_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const ACCESS_CODE_MINIMUM_LENGTH = 24;
const SESSION = /^v1\.([0-9]{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export function isMaibReviewAccessCodeValid(
  candidate: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const expected = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  const supplied = candidate.trim();
  if (expected.length < ACCESS_CODE_MINIMUM_LENGTH || supplied.length < ACCESS_CODE_MINIMUM_LENGTH) return false;
  return safeEqual(digest(supplied), digest(expected));
}

export function createMaibReviewSession(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
  nonce = randomBytes(16).toString("base64url"),
) {
  const secret = reviewSecret(environment);
  const expiresAt = Math.floor(now / 1_000) + MAIB_REVIEW_SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function validateMaibReviewSession(
  value: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
) {
  const match = value?.match(SESSION);
  const secret = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  if (!match || secret.length < ACCESS_CODE_MINIMUM_LENGTH) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1_000)) return false;
  if (expiresAt > Math.floor(now / 1_000) + MAIB_REVIEW_SESSION_MAX_AGE_SECONDS) return false;
  const payload = `v1.${match[1]}.${match[2]}`;
  return safeEqual(Buffer.from(match[3], "base64url"), Buffer.from(sign(payload, secret), "base64url"));
}

function reviewSecret(environment: Readonly<Record<string, string | undefined>>) {
  const secret = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  if (secret.length < ACCESS_CODE_MINIMUM_LENGTH) throw new Error("MAIB review access is not configured.");
  return secret;
}

function digest(value: string) { return createHmac("sha256", "novotech-maib-review-access-v1").update(value, "utf8").digest(); }
function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value, "utf8").digest("base64url"); }
function safeEqual(left: Buffer, right: Buffer) { return left.length === right.length && timingSafeEqual(left, right); }
