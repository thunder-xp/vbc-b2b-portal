import "server-only";

import { createHmac } from "node:crypto";

import { getCustomerIdentityHashingEnv } from "@/src/lib/env";

import type { CustomerIdentityKeyType, HashedIdentityKey } from "./types";

export function hashCustomerIdentityKey(
  keyType: CustomerIdentityKeyType,
  normalizedValue: string,
  verified: boolean,
): HashedIdentityKey {
  const { secret, keyVersion } = getCustomerIdentityHashingEnv();
  const keyHash = createHmac("sha256", secret)
    .update(`customer-identity:v${keyVersion}:${keyType}:${normalizedValue}`)
    .digest("hex");

  return { keyType, keyHash, keyVersion, verified };
}
