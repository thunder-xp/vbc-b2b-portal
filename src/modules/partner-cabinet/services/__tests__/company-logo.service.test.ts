import { describe, expect, it } from "vitest";

import { validateCompanyLogo } from "../company-logo.service";

describe("company logo validation", () => {
  it("accepts validated PNG, JPEG, and WEBP signatures", () => {
    expect(validateCompanyLogo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe("png");
    expect(validateCompanyLogo(Uint8Array.from([0xff, 0xd8, 0x00, 0xff, 0xd9]), "image/jpeg")).toBe("jpg");
    expect(validateCompanyLogo(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp")).toBe("webp");
  });

  it("rejects SVG and mismatched content signatures", () => {
    expect(() => validateCompanyLogo(new TextEncoder().encode("<svg></svg>"), "image/svg+xml")).toThrow("COMPANY_LOGO_FORMAT");
    expect(() => validateCompanyLogo(new TextEncoder().encode("not a png"), "image/png")).toThrow("COMPANY_LOGO_FORMAT");
  });

  it("rejects empty and oversized files", () => {
    expect(() => validateCompanyLogo(new Uint8Array(), "image/png")).toThrow("COMPANY_LOGO_SIZE");
    expect(() => validateCompanyLogo(new Uint8Array(2 * 1024 * 1024 + 1), "image/png")).toThrow("COMPANY_LOGO_SIZE");
  });
});
