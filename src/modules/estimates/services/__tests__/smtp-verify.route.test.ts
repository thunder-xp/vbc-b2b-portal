import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock("@/src/modules/estimates/services", () => ({ verifySmtpTransport: mocks.verify }));

import { POST } from "../../../../../app/api/internal/smtp-verify/route";

describe("POST /api/internal/smtp-verify", () => {
  beforeEach(() => {
    vi.stubEnv("SMTP_DIAGNOSTIC_SECRET", "diagnostic-secret");
    mocks.verify.mockResolvedValue({ configured: true, connectionSuccessful: true, authenticationSuccessful: true, errorCategory: null, durationMs: 25 });
  });

  it("rejects unauthenticated diagnostics without touching SMTP", async () => {
    const response = await POST(new Request("https://www.nsd.md/api/internal/smtp-verify", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns only safe verification fields to an authorized caller", async () => {
    const response = await POST(new Request("https://www.nsd.md/api/internal/smtp-verify", { method: "POST", headers: { authorization: "Bearer diagnostic-secret" } }));
    await expect(response.json()).resolves.toEqual({ configured: true, connectionSuccessful: true, authenticationSuccessful: true, errorCategory: null, durationMs: 25 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
