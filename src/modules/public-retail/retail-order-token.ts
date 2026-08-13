import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function createRetailOrderAccessToken() { const token = randomBytes(32).toString("base64url"); return { token, hash: hashRetailOrderAccessToken(token) }; }
export function deriveRetailOrderAccessToken(cartToken: string, submissionKey: string) { const token = createHash("sha256").update(`retail-order-v1:${cartToken}:${submissionKey}`, "utf8").digest("base64url"); return { token, hash: hashRetailOrderAccessToken(token)! }; }
export function hashRetailOrderAccessToken(token: string) { if (!TOKEN.test(token)) return null; return createHash("sha256").update(token, "utf8").digest("hex"); }
