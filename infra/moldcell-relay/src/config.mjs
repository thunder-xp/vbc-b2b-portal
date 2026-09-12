import { resolve } from "node:path";

export const RELAY_HOST = "127.0.0.1";
export const RELAY_PATH = "/internal/omnichannel/v1/sms/moldcell";
export const HEALTH_PATH = "/health";
export const MAX_BODY_BYTES = 2_048;
export const MAX_SMS_CHARACTERS = 70;

export function loadConfig(environment = process.env) {
  const baseUrl = parseMoldcellBaseUrl(environment.MOLDCELL_BASE_URL);
  const providerId = identifier(environment.MOLDCELL_PROVIDER_ID);
  const customerId = identifier(environment.MOLDCELL_CUSTOMER_ID);
  const guid = secret(environment.MOLDCELL_GUID, 16);
  const sender = environment.MOLDCELL_SENDER?.trim() ?? "";
  const template = environment.MOLDCELL_TEMPLATE?.trim() ?? "";
  const keyId = identifier(environment.RELAY_KEY_ID);
  const relaySecret = secret(environment.RELAY_AUTH_SECRET, 32);

  return Object.freeze({
    host: RELAY_HOST,
    port: boundedInteger(environment.RELAY_PORT, 8_091, 1_024, 65_535),
    version: boundedVersion(environment.RELAY_VERSION) ?? "1.0.0",
    databasePath: resolve(environment.RELAY_DATABASE_PATH?.trim() || "/var/lib/nsd-sms-relay/relay.sqlite"),
    keyId,
    relaySecret,
    replayWindowSeconds: boundedInteger(environment.RELAY_REPLAY_WINDOW_SECONDS, 300, 60, 900),
    idempotencyTtlSeconds: boundedInteger(environment.RELAY_IDEMPOTENCY_TTL_SECONDS, 604_800, 86_400, 2_592_000),
    rateLimitPerMinute: boundedInteger(environment.RELAY_RATE_LIMIT_PER_MINUTE, 30, 1, 300),
    maxBodyBytes: MAX_BODY_BYTES,
    maxSmsCharacters: MAX_SMS_CHARACTERS,
    moldcell: Object.freeze({
      baseUrl,
      providerId,
      customerId,
      guid,
      sender,
      template,
      timeoutMs: boundedInteger(environment.MOLDCELL_TIMEOUT_MS, 10_000, 1_000, 30_000),
    }),
    authenticationConfigured: Boolean(keyId && relaySecret),
    providerConfigured: Boolean(
      baseUrl && providerId && customerId && guid && sender === "NSD" && template === "NSD_NOTIFICATION",
    ),
  });
}

function parseMoldcellBaseUrl(value) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.hostname !== "wsg.moldcell.md" || url.port
      || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) return null;
    return new URL("https://wsg.moldcell.md/");
  } catch {
    return null;
  }
}

function identifier(value) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 1 && normalized.length <= 200 && /^[A-Za-z0-9_.-]+$/.test(normalized)
    ? normalized : null;
}

function secret(value, minimumLength) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= minimumLength && normalized.length <= 512 ? normalized : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function boundedVersion(value) {
  const normalized = value?.trim() ?? "";
  return /^[A-Za-z0-9._-]{1,40}$/.test(normalized) ? normalized : null;
}
