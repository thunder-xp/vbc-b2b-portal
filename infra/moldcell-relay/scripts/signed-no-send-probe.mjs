import { randomUUID } from "node:crypto";

import { createSignature } from "../src/security.mjs";

const endpoint = process.env.RELAY_PUBLIC_URL;
const keyId = process.env.RELAY_KEY_ID;
const secret = process.env.RELAY_AUTH_SECRET;
if (!endpoint || !keyId || !secret) {
  console.error("RELAY_PUBLIC_URL, RELAY_KEY_ID and RELAY_AUTH_SECRET are required.");
  process.exit(1);
}
const parsedEndpoint = new URL(endpoint);
if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.pathname !== "/internal/omnichannel/v1/sms/moldcell") {
  console.error("RELAY_PUBLIC_URL must be the exact HTTPS relay endpoint.");
  process.exit(1);
}

const timestamp = Math.floor(Date.now() / 1_000);
const nonce = randomUUID();
const deliveryId = randomUUID();
const idempotencyKey = `no-send-probe:${deliveryId}`;
const body = JSON.stringify({
  deliveryId,
  recipient: "+40722123456",
  message: "NSD relay authentication probe",
  idempotencyKey,
  timestamp,
});
const signature = createSignature(secret, String(timestamp), nonce, body, idempotencyKey);
const response = await fetch(parsedEndpoint, {
  method: "POST",
  redirect: "error",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Correlation-Id": deliveryId,
    "X-NSD-Key-Id": keyId,
    "X-NSD-Timestamp": String(timestamp),
    "X-NSD-Nonce": nonce,
    "X-NSD-Signature": `sha256=${signature}`,
  },
  body,
});
const result = await response.json();
if (response.status !== 422 || result.status !== "NO_SMS_PROVIDER_FOR_DESTINATION") {
  console.error(JSON.stringify({ status: response.status, result }));
  process.exit(1);
}
console.log(JSON.stringify({
  authenticated: true,
  providerAttempted: false,
  status: result.status,
  deliveryId,
}));
