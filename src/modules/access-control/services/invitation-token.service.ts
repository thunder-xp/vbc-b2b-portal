import "server-only";

import { createHash, randomBytes } from "node:crypto";

export type InvitationToken = {
  plaintext: string;
  hash: string;
};

export function generateInvitationToken(): InvitationToken {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, hash: hashInvitationToken(plaintext) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
