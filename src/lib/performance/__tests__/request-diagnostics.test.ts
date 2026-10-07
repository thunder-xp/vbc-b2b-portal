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
};

describe("request diagnostics", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE", "1");
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
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
