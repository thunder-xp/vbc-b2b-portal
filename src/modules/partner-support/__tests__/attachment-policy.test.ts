import { describe, expect, it } from "vitest";

import { hasValidSupportFileSignature, SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MIME } from "../attachment-policy";

describe("support attachment policy", () => {
  it.each([
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts a valid %s signature", (mime, signature) => {
    expect(hasValidSupportFileSignature(Uint8Array.from(signature), mime)).toBe(true);
  });

  it("rejects mismatched and executable signatures", () => {
    expect(hasValidSupportFileSignature(Uint8Array.from([0x4d, 0x5a]), "application/pdf")).toBe(false);
    expect(hasValidSupportFileSignature(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), "image/png")).toBe(false);
  });

  it("keeps the allowlist and size limit bounded", () => {
    expect(SUPPORT_ATTACHMENT_MIME).toEqual(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    expect(SUPPORT_ATTACHMENT_MAX_BYTES).toBe(15 * 1024 * 1024);
  });
});
