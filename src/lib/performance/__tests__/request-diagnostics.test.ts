import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deferRoutePerformance,
  measurePerformanceStage,
  recordAuthCall,
  recordDatabaseQuery,
  recordLiveProviderCall,
  resolveDiagnosticsSampleRate,
  withRoutePerformance,
} from "../request-diagnostics";

type Event = {
  authCalls: number;
  correlationId: string;
  databaseDurationMs: number;
  databaseQueryCount: number;
  deployedCommitSha: string;
  liveProviderCalls: number;
  routeCategory: string;
  stage: string;
  durationMs: number;
};

describe("request diagnostics", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE", "1");
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("isolates concurrent route correlations and counters", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = withRoutePerformance("cart", async () => {
      recordDatabaseQuery(20);
      await gate;
      recordAuthCall();
    });
    const second = withRoutePerformance("orders", async () => {
      recordDatabaseQuery(45);
      recordDatabaseQuery(5);
      releaseFirst();
    });
    await Promise.all([first, second]);

    const totals = events().filter((event) => event.stage === "total_server");
    expect(totals).toHaveLength(2);
    expect(new Set(totals.map((event) => event.correlationId)).size).toBe(2);
    expect(totals.find((event) => event.routeCategory === "cart")).toMatchObject({ authCalls: 1, databaseQueryCount: 1, databaseDurationMs: 20 });
    expect(totals.find((event) => event.routeCategory === "orders")).toMatchObject({ authCalls: 0, databaseQueryCount: 2, databaseDurationMs: 50 });
  });

  it("emits stage-local deltas and one whole-route total", async () => {
    await withRoutePerformance("cart", async () => {
      recordDatabaseQuery(20);
      recordDatabaseQuery(0);
      await measurePerformanceStage("cart", "commercial_resolution", async () => {
        recordDatabaseQuery(10);
        recordDatabaseQuery(15);
        recordDatabaseQuery(20);
        recordLiveProviderCall();
      });
    });

    const emitted = events();
    expect(emitted.filter((event) => event.stage === "total_server")).toHaveLength(1);
    expect(emitted.find((event) => event.stage === "commercial_resolution")).toMatchObject({
      databaseQueryCount: 3,
      databaseDurationMs: 45,
      liveProviderCalls: 1,
    });
    expect(emitted.find((event) => event.stage === "total_server")).toMatchObject({
      databaseQueryCount: 5,
      databaseDurationMs: 65,
      liveProviderCalls: 1,
    });
    expect(new Set(emitted.map((event) => event.correlationId)).size).toBe(1);
    expect(Object.keys(emitted[0] ?? {}).sort()).toEqual([
      "authCalls",
      "correlationId",
      "databaseDurationMs",
      "databaseQueryCount",
      "deployedCommitSha",
      "durationMs",
      "environment",
      "event",
      "liveProviderCalls",
      "routeCategory",
      "sampleRate",
      "stage",
    ]);
  });

  it("keeps the total open for a streamed continuation", async () => {
    let continuation!: ReturnType<typeof deferRoutePerformance>;
    await withRoutePerformance("catalog", async () => {
      continuation = deferRoutePerformance();
    });
    expect(events()).toHaveLength(0);
    await continuation(async () => {
      await measurePerformanceStage("catalog", "facets", async () => recordDatabaseQuery(12));
    });
    expect(events().map((event) => event.stage)).toEqual(["facets", "total_server"]);
  });

  it("keeps Dashboard ownership until the last parallel stage settles after an early failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let last!: Promise<void>;
    await withRoutePerformance("dashboard", async () => {
      last = measurePerformanceStage("dashboard", "dashboard_aggregate", async () => {
        await gate;
        recordDatabaseQuery(23);
        recordAuthCall();
        recordLiveProviderCall();
      });
      await Promise.all([
        last,
        measurePerformanceStage("dashboard", "product_selections", async () => {
          throw new Error("selection failure");
        }),
      ]).catch(() => undefined);
    });
    const prematureTotals = events().filter((event) => event.stage === "total_server");
    release();
    await last;
    expect(prematureTotals).toHaveLength(0);
    expect(events().map((event) => event.stage)).toEqual([
      "product_selections", "dashboard_aggregate", "total_server",
    ]);
    expect(events().filter((event) => event.stage === "total_server")).toEqual([
      expect.objectContaining({ databaseQueryCount: 1, databaseDurationMs: 23, authCalls: 1, liveProviderCalls: 1 }),
    ]);
  });

  it("honors deterministic zero and one sampling rates and safely bounds invalid values", async () => {
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE", "0");
    await withRoutePerformance("dashboard", async () => recordDatabaseQuery(5));
    expect(events()).toHaveLength(0);

    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE", "1");
    await withRoutePerformance("dashboard", async () => undefined);
    expect(events().filter((event) => event.stage === "total_server")).toHaveLength(1);
    expect(resolveDiagnosticsSampleRate("-1")).toBe(0);
    expect(resolveDiagnosticsSampleRate("2")).toBe(1);
    expect(resolveDiagnosticsSampleRate("not-a-number")).toBe(process.env.NODE_ENV === "production" ? 0.05 : 1);
  });

  it("covers the last parallel branch with wall time and independent stage counters", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const route = withRoutePerformance("dashboard", async () => {
      await Promise.all([
        measurePerformanceStage("dashboard", "finance_guidance", async () => {
          recordDatabaseQuery(17);
        }),
        measurePerformanceStage("dashboard", "reference_enrichment", async () => {
          await gate;
          recordDatabaseQuery(41);
        }),
      ]);
      return "unchanged";
    });
    vi.advanceTimersByTime(100);
    release();
    expect(await route).toBe("unchanged");
    expect(events().map((event) => event.stage)).toEqual(["finance_guidance", "reference_enrichment", "total_server"]);
    const total = events().at(-1)!;
    expect(total.durationMs).toBeGreaterThanOrEqual(100);
    expect(total.durationMs).toBeGreaterThanOrEqual(Math.max(...events().slice(0, -1).map((event) => event.durationMs)));
    expect(total).toMatchObject({ databaseQueryCount: 2, databaseDurationMs: 58 });
    expect(events()[0]).toMatchObject({ databaseQueryCount: 1, databaseDurationMs: 17 });
    expect(events()[1]).toMatchObject({ databaseQueryCount: 1, databaseDurationMs: 41 });
  });

  it("keeps nested stages and route calls under one total without double counting", async () => {
    await withRoutePerformance("dashboard", async () => {
      await measurePerformanceStage("dashboard", "outer", async () => {
        recordDatabaseQuery(3);
        await withRoutePerformance("cart", async () => {
          await measurePerformanceStage("dashboard", "inner", async () => recordDatabaseQuery(7));
        });
      });
    });
    expect(events().map((event) => event.stage)).toEqual(["inner", "outer", "total_server"]);
    expect(events()[0]).toMatchObject({ databaseQueryCount: 1, databaseDurationMs: 7 });
    expect(events()[1]).toMatchObject({ databaseQueryCount: 2, databaseDurationMs: 10 });
    expect(events()[2]).toMatchObject({ routeCategory: "dashboard", databaseQueryCount: 2, databaseDurationMs: 10 });
  });

  it("releases an erroring deferred continuation once and preserves the original error", async () => {
    let continuation!: ReturnType<typeof deferRoutePerformance>;
    await withRoutePerformance("dashboard", async () => { continuation = deferRoutePerformance(); });
    const error = new Error("original error");
    await expect(continuation(async () => {
      await measurePerformanceStage("dashboard", "support_tickets", async () => {
        recordDatabaseQuery(9);
        throw error;
      });
    })).rejects.toBe(error);
    await expect(continuation(async () => undefined)).rejects.toThrow("already consumed");
    expect(events().map((event) => event.stage)).toEqual(["support_tickets", "total_server"]);
  });

  it("isolates pending continuations and parallel stage stacks between requests", async () => {
    let continuation!: ReturnType<typeof deferRoutePerformance>;
    await withRoutePerformance("dashboard", async () => { continuation = deferRoutePerformance(); });
    await withRoutePerformance("cart", async () => {
      await measurePerformanceStage("cart", "cart_context", async () => recordDatabaseQuery(4));
    });
    expect(events().filter((event) => event.stage === "total_server").map((event) => event.routeCategory)).toEqual(["cart"]);
    await continuation(async () => {
      await measurePerformanceStage("dashboard", "reference_enrichment", async () => recordDatabaseQuery(8));
    });
    const cart = events().filter((event) => event.routeCategory === "cart");
    const dashboard = events().filter((event) => event.routeCategory === "dashboard");
    expect(cart).toHaveLength(2);
    expect(dashboard).toHaveLength(2);
    expect(cart[0].correlationId).not.toBe(dashboard[0].correlationId);
    expect(cart.every((event) => event.databaseQueryCount === 1 && event.databaseDurationMs === 4)).toBe(true);
    expect(dashboard.every((event) => event.databaseQueryCount === 1 && event.databaseDurationMs === 8)).toBe(true);
  });

  it("leaves business output unchanged and emits nothing when disabled", async () => {
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_ENABLED", "false");
    const result = await withRoutePerformance("estimates", async () => {
      recordAuthCall();
      return "business-result";
    });
    expect(result).toBe("business-result");
    expect(events()).toHaveLength(0);
  });

  it("uses explicit deployment commit metadata when Vercel metadata is unavailable", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GIT_COMMIT_SHA", "task-commit");
    await withRoutePerformance("orders", async () => undefined);
    expect(events().find((event) => event.stage === "total_server")?.deployedCommitSha).toBe(
      "task-commit",
    );
  });

  it("prefers Vercel deployment commit metadata when it is available", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "vercel-commit");
    vi.stubEnv("GIT_COMMIT_SHA", "fallback-commit");
    await withRoutePerformance("orders", async () => undefined);
    expect(events().find((event) => event.stage === "total_server")?.deployedCommitSha).toBe(
      "vercel-commit",
    );
  });

  function events(): Event[] {
    return info.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])) as Event);
  }
});
