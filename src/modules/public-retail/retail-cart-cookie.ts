import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "novotech_retail_cart";
const MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export async function getRetailCartTokenHash(): Promise<string | null> { const value = (await cookies()).get(COOKIE)?.value; return value && TOKEN.test(value) ? hash(value) : null; }
export async function getRetailCartTokenCredential(): Promise<{ token: string; hash: string } | null> { const value = (await cookies()).get(COOKIE)?.value; return value && TOKEN.test(value) ? { token: value, hash: hash(value) } : null; }
export async function getOrCreateRetailCartTokenHash(): Promise<string> { const store = await cookies(); const existing = store.get(COOKIE)?.value; if (existing && TOKEN.test(existing)) return hash(existing); const token = randomBytes(32).toString("base64url"); store.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE }); return hash(token); }
export async function rotateRetailCartTokenHash(): Promise<string> { const store = await cookies(); const token = randomBytes(32).toString("base64url"); store.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE }); return hash(token); }
function hash(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
