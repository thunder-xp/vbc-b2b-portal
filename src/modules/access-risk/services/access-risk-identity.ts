import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const DEVICE_COOKIE = "novotech_access_device";
export type AccessRiskIdentity = {
  sessionHash: string;
  sessionBuckets: number[];
  deviceHash: string;
  deviceBuckets: number[];
  networkHash: string | null;
  networkBuckets: number[];
  countryCode: string | null;
  regionCode: string | null;
  deviceCookie: { name: string; value: string } | null;
};

export function resolveAccessRiskIdentity(request: Request, sessionId: string): AccessRiskIdentity | null {
  const secrets = getHashSecrets();
  if (!secrets) return null;
  const cookies = parseCookies(request.headers.get("cookie"));
  const existingDevice = verifyDeviceToken(cookies.get(DEVICE_COOKIE), secrets);
  const deviceId = existingDevice?.deviceId ?? randomUUID();
  const networkPrefix = normalizeNetworkPrefix(firstForwardedAddress(request));
  const sessionHash = hashIdentity(secrets.current, "session", sessionId);
  const deviceHash = hashIdentity(secrets.current, "device", deviceId);
  const networkHash = networkPrefix ? hashIdentity(secrets.current, "network", networkPrefix) : null;
  const country = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const region = request.headers.get("x-vercel-ip-country-region")?.trim().toUpperCase() ?? "";
  return {
    sessionHash,
    sessionBuckets: [aggregateBucket("session", sessionId)],
    deviceHash,
    deviceBuckets: [aggregateBucket("device", deviceId)],
    networkHash,
    networkBuckets: networkPrefix ? [aggregateBucket("network", networkPrefix)] : [],
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    regionCode: /^[A-Z0-9-]{1,20}$/.test(region) ? region : null,
    deviceCookie: existingDevice?.current === true ? null : { name: DEVICE_COOKIE, value: signDeviceToken(deviceId, secrets.current) },
  };
}

export function hashRiskDimension(namespace: "product" | "category", value: string): number[] {
  return isUuid(value) ? [aggregateBucket(namespace, value)] : [];
}

export function accessRiskIdentityConfigured(): boolean { return Boolean(getHashSecrets()); }

type VersionedSecret = { version: string; secret: string };
type HashSecrets = { current: VersionedSecret; previous: VersionedSecret | null; all: VersionedSecret[] };

function getHashSecrets(): HashSecrets | null {
  const dedicated = process.env.ACCESS_RISK_HMAC_SECRET?.trim();
  const version = normalizeVersion(process.env.ACCESS_RISK_HMAC_VERSION) ?? "v1";
  const safeServerFallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const currentSecret = dedicated && dedicated.length >= 32 ? dedicated : safeServerFallback;
  if (!currentSecret || currentSecret.length < 32) return null;
  const current = { version, secret: currentSecret };
  const previousSecret = process.env.ACCESS_RISK_HMAC_SECRET_PREVIOUS?.trim();
  const previousVersion = normalizeVersion(process.env.ACCESS_RISK_HMAC_PREVIOUS_VERSION);
  const previous = previousSecret && previousSecret.length >= 32 && previousVersion && previousVersion !== version
    ? { version: previousVersion, secret: previousSecret } : null;
  return { current, previous, all: previous ? [current, previous] : [current] };
}

function hashIdentity(key: VersionedSecret, namespace: string, value: string): string {
  return `${key.version}:${createHmac("sha256", key.secret).update(`${namespace}:${value}`).digest("hex")}`;
}

function aggregateBucket(namespace: string, value: string): number {
  return Number.parseInt(createHash("sha256").update(`aggregate:${namespace}:${value}`).digest("hex").slice(-2), 16);
}

function signDeviceToken(deviceId: string, key: VersionedSecret): string {
  const signature = createHmac("sha256", key.secret).update(`device-cookie:${deviceId}`).digest("hex");
  return `${key.version}.${deviceId}.${signature}`;
}

function verifyDeviceToken(value: string | undefined, secrets: HashSecrets): { deviceId: string; current: boolean } | null {
  if (!value) return null;
  const [version, deviceId, signature, extra] = value.split(".");
  const key = secrets.all.find((item) => item.version === version);
  if (extra || !key || !isUuid(deviceId) || !/^[0-9a-f]{64}$/.test(signature ?? "")) return null;
  const expected = createHmac("sha256", key.secret).update(`device-cookie:${deviceId}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right)
    ? { deviceId, current: key.version === secrets.current.version } : null;
}

function parseCookies(header: string | null): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    result.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return result;
}

function firstForwardedAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

export function normalizeNetworkPrefix(raw: string | null): string | null {
  if (!raw) return null;
  const address = raw.replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  }
  if (version !== 6) return null;
  const parts = expandIpv6(address);
  return parts ? `${parts.slice(0, 4).join(":")}::/64` : null;
}

function expandIpv6(address: string): string[] | null {
  const [leftRaw, rightRaw, extra] = address.toLowerCase().split("::");
  if (extra !== undefined) return null;
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (!address.includes("::") && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  return parts.length === 8 && parts.every((part) => /^[0-9a-f]{1,4}$/.test(part))
    ? parts.map((part) => part.padStart(4, "0")) : null;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function normalizeVersion(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^v[1-9][0-9]{0,2}$/.test(normalized) ? normalized : null;
}
