import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateInvitationToken,
  hashInvitationToken,
} from "../invitation-token.service";

describe("invitation token service", () => {
  it("generates at least 256 bits and stores only a SHA-256 hash", () => {
    const token = generateInvitationToken();
    expect(Buffer.from(token.plaintext, "base64url")).toHaveLength(32);
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.hash).not.toContain(token.plaintext);
    expect(hashInvitationToken(token.plaintext)).toBe(token.hash);
  });

  it("generates unique credentials", () => {
    expect(generateInvitationToken().plaintext).not.toBe(
      generateInvitationToken().plaintext,
    );
  });
});
