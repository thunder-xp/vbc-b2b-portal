import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAIB_REVIEW_COOKIE = "novotech_maib_review";
// Cookie persistence is transport metadata only. Session validity has no time limit and
// is controlled by the current server-side review credential/configuration.
export const MAIB_REVIEW_COOKIE_EXPIRES_AT = new Date("9999-12-31T23:59:59.000Z");

const ACCESS_CODE_MINIMUM_LENGTH = 24;
const SESSION = /^v2\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export function isMaibReviewAccessCodeValid(
  candidate: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const expected = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  const supplied = candidate.trim();
  if (!isReviewAccessEnabled(environment) || expected.length < ACCESS_CODE_MINIMUM_LENGTH || supplied.length < ACCESS_CODE_MINIMUM_LENGTH) return false;
  return safeEqual(digest(supplied), digest(expected));
}

export function createMaibReviewSession(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  nonce = randomBytes(16).toString("base64url"),
) {
  const secret = reviewSecret(environment);
  const payload = `v2.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function validateMaibReviewSession(
  value: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const match = value?.match(SESSION);
  const secret = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  if (!match || !isReviewAccessEnabled(environment) || secret.length < ACCESS_CODE_MINIMUM_LENGTH) return false;
  const payload = `v2.${match[1]}`;
  return safeEqual(Buffer.from(match[2], "base64url"), Buffer.from(sign(payload, secret), "base64url"));
}

function reviewSecret(environment: Readonly<Record<string, string | undefined>>) {
  const secret = environment.MAIB_REVIEW_ACCESS_SECRET?.trim() ?? "";
  if (!isReviewAccessEnabled(environment) || secret.length < ACCESS_CODE_MINIMUM_LENGTH) throw new Error("MAIB review access is not configured.");
  return secret;
}

function isReviewAccessEnabled(environment: Readonly<Record<string, string | undefined>>) {
  return environment.MAIB_REVIEW_ACCESS_ENABLED?.trim().toLowerCase() !== "false";
}

function digest(value: string) { return createHmac("sha256", "novotech-maib-review-access-v1").update(value, "utf8").digest(); }
function sign(value: string, secret: string) { return createHmac("sha256", secret).update(value, "utf8").digest("base64url"); }
function safeEqual(left: Buffer, right: Buffer) { return left.length === right.length && timingSafeEqual(left, right); }
