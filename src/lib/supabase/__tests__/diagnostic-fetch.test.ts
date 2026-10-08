import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRoutePerformance, measurePerformanceStage } from "@/src/lib/performance/request-diagnostics";
import { createAdminClient } from "../admin";
import { createClient } from "../server";
import { diagnosticFetch } from "../diagnostic-fetch";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

describe("Supabase outbound diagnostics", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:59421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "unit-only-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-only-server-key");
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("counts authenticated and admin RPCs once in their parallel stages and route total", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const outbound = vi.fn(async () => new Response("[]", { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", outbound);
    await withRoutePerformance("dashboard", async () => {
      const authenticated = await createClient();
      const admin = createAdminClient();
      await Promise.all([
        measurePerformanceStage("dashboard", "dashboard_aggregate", async () => {
          await authenticated.rpc("get_partner_dashboard_v4");
        }),
        measurePerformanceStage("dashboard", "product_selections", async () => {
          await admin.rpc("get_or_refresh_partner_dashboard_selections_v7");
        }),
      ]);
    });
    expect(outbound).toHaveBeenCalledTimes(2);
    const events = info.mock.calls.map(([event]) => JSON.parse(String(event)));
    expect(events.filter(event => event.stage === "total_server")).toEqual([
      expect.objectContaining({ databaseQueryCount: 2 }),
    ]);
    expect(events.filter(event => event.stage !== "total_server").map(event => event.databaseQueryCount)).toEqual([1, 1]);
    expect(new Set(events.map(event => event.correlationId)).size).toBe(1);
  });

  it("counts failed DB requests while preserving fetch inputs, responses and errors", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = new Error("network failure");
    const response = new Response("ok");
    const outbound = vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(error);
    vi.stubGlobal("fetch", outbound);
    const authUrl = new URL("http://127.0.0.1:59421/auth/v1/token");
    const init = { method: "POST", body: "unit-only-body" };
    await withRoutePerformance("dashboard", async () => {
      expect(await diagnosticFetch(authUrl, init)).toBe(response);
      await expect(diagnosticFetch(new Request("http://127.0.0.1:59421/rest/v1/rpc/read"))).rejects.toBe(error);
    });
    expect(outbound.mock.calls[0]).toEqual([authUrl, init]);
    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({ stage: "total_server", databaseQueryCount: 1 });
  });
});
