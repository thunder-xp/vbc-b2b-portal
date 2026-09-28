import { afterEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@/src/modules/auth/send-email-hook.service", () => ({
  SendEmailHookError: class SendEmailHookError extends Error { constructor(readonly code: string) { super(code); } },
  handleSupabaseSendEmailHook: hook.handle,
}));

import { GET, POST } from "./route";

afterEach(() => {
  hook.handle.mockReset();
  vi.restoreAllMocks();
});

describe("Supabase Send Email Hook route", () => {
  it("rejects non-POST methods using a JSON-only contract", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toMatchObject({ error: { message: "METHOD_NOT_ALLOWED" } });
  });

  it("returns the required JSON success response and bounded duration header", async () => {
    hook.handle.mockResolvedValue({ correlationId: "corr-1", durationMs: 240 });
    const response = await POST(request(JSON.stringify({ signed: true })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-correlation-id")).toBe("corr-1");
    expect(response.headers.get("x-auth-hook-duration-ms")).toBe("240");
    await expect(response.json()).resolves.toEqual({});
  });

  it.each([
    ["wrong content type", () => new Request("https://www.nsd.md/api/auth/hooks/send-email", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })],
    ["announced oversized body", () => new Request("https://www.nsd.md/api/auth/hooks/send-email", { method: "POST", headers: { "content-type": "application/json", "content-length": "70000" }, body: "{}" })],
    ["actual oversized body", () => new Request("https://www.nsd.md/api/auth/hooks/send-email", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array(65 * 1024) })],
  ])("returns a no-store JSON error for %s", async (_name, createRequest) => {
    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: { http_code: 400, message: "INVALID_REQUEST" } });
    expect(hook.handle).not.toHaveBeenCalled();
  });

  it.each([
    ["SIGNATURE_INVALID", 401, undefined],
    ["PAYLOAD_INVALID", 400, undefined],
    ["CONFIGURATION_INVALID", 503, undefined],
    ["DELIVERY_CONFIGURATION_INVALID", 503, undefined],
    ["DELIVERY_UNAVAILABLE", 503, "3"],
  ] as const)("maps %s to sanitized JSON status %i", async (code, status, retryAfter) => {
    hook.handle.mockRejectedValue(new (await import("@/src/modules/auth/send-email-hook.service")).SendEmailHookError(code));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request("sensitive signed request content"));
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe(retryAfter ?? null);
    const body = await response.json();
    expect(body.error.message).toBe(code.includes("CONFIGURATION") || code === "DELIVERY_CONFIGURATION_INVALID" ? "DELIVERY_UNAVAILABLE" : code);
    expect(JSON.stringify(body)).not.toContain("sensitive signed request content");
    expect(JSON.stringify(error.mock.calls)).not.toContain("sensitive signed request content");
  });

  it("maps unknown SMTP/provider exceptions to a safe retryable JSON response", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hook.handle.mockRejectedValue(new Error("SMTP_PASSWORD=do-not-disclose"));
    const response = await POST(request("{}"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("3");
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ error: { message: "DELIVERY_UNAVAILABLE" } });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("do-not-disclose");
  });
});

function request(body: string): Request {
  return new Request("https://www.nsd.md/api/auth/hooks/send-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}
