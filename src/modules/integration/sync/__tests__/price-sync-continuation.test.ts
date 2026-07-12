import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchPriceSync, PriceSyncLaunchError, resolvePriceSyncInternalUrl } from "../price-sync-continuation";

describe("price sync initial launcher", () => {
  beforeEach(() => { vi.stubEnv("PRICE_SYNC_SECRET", "top-secret"); vi.stubEnv("PRICE_SYNC_INTERNAL_BASE_URL", "www.nsd.md/"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("uses an absolute configured URL and exact authenticated request", async () => {
    const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await launchPriceSync(syncId, "https://ignored.example");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://www.nsd.md/api/internal/price-sync");
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/^\/api/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ syncId }), headers: { Authorization: "Bearer top-secret", "Content-Type": "application/json" } });
  });

  it.each([200, 202])("accepts HTTP %s", async (status) => { vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status }))); await expect(launchPriceSync(syncId)).resolves.toMatchObject({ status }); });
  it.each([401, 403, 404, 500])("rejects HTTP %s with a safe status", async (status) => { vi.stubGlobal("fetch", vi.fn(async () => new Response("secret body", { status }))); await expect(launchPriceSync(syncId)).rejects.toMatchObject({ safeMessage: `Internal endpoint returned ${status}.`, status }); });

  it("fails fast when no secret exists", async () => { vi.stubEnv("PRICE_SYNC_SECRET", ""); vi.stubEnv("CRON_SECRET", ""); await expect(launchPriceSync(syncId)).rejects.toBeInstanceOf(PriceSyncLaunchError); });
  it("resolves URL priority and normalizes hostnames", () => { vi.stubEnv("PRICE_SYNC_INTERNAL_BASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_APP_URL", "portal.example/"); expect(resolvePriceSyncInternalUrl("https://request.example").toString()).toBe("https://portal.example/api/internal/price-sync"); });
  it("never logs the secret", async () => { const info = vi.spyOn(console, "info").mockImplementation(() => undefined); const error = vi.spyOn(console, "error").mockImplementation(() => undefined); vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 }))); await launchPriceSync(syncId).catch(() => undefined); expect(JSON.stringify([...info.mock.calls, ...error.mock.calls])).not.toContain("top-secret"); });
});

const syncId = "11111111-1111-4111-8111-111111111111";
