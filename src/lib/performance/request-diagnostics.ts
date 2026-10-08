import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type PerformanceRouteCategory =
  | "dashboard"
  | "catalog"
  | "product_detail"
  | "cart"
  | "orders"
  | "special_offers"
  | "estimates"
  | "estimate_detail";

type PerformanceCounters = {
  authCalls: number;
  databaseDurationMs: number;
  databaseQueryCount: number;
  liveProviderCalls: number;
};

type PerformanceRequestState = PerformanceCounters & {
  correlationId: string;
  environment: string;
  pendingBoundaries: number;
  routeCategory: PerformanceRouteCategory;
  sampleRate: number;
  sampled: boolean;
  startedAt: number;
  totalEmitted: boolean;
};

type PerformanceExecutionContext = {
  activeStages: PerformanceCounters[];
  request: PerformanceRequestState;
};

export type DeferredPerformanceMeasurement = <T>(operation: () => Promise<T>) => Promise<T>;

const requestStorage = new AsyncLocalStorage<PerformanceExecutionContext>();

export function recordAuthCall(): void {
  incrementCounters("authCalls", 1);
}

export function recordDatabaseQuery(durationMs: number): void {
  const context = requestStorage.getStore();
  if (!context?.request.sampled) return;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  context.request.databaseQueryCount += 1;
  context.request.databaseDurationMs += safeDuration;
  for (const stage of context.activeStages) {
    stage.databaseQueryCount += 1;
    stage.databaseDurationMs += safeDuration;
  }
}

export function recordLiveProviderCall(): void {
  incrementCounters("liveProviderCalls", 1);
}

/**
 * Measures elapsed execution inside the explicit server route/render boundary.
 * It does not represent TTFB, LCP, network time, or complete browser navigation.
 * Database duration is accumulated call duration and may exceed critical-path
 * wall time when database work runs in parallel.
 */
export async function withRoutePerformance<T>(
  routeCategory: PerformanceRouteCategory,
  operation: () => Promise<T>,
): Promise<T> {
  if (!diagnosticsEnabled()) return operation();

  const existing = requestStorage.getStore();
  if (existing) return operation();

  const sampleRate = resolveDiagnosticsSampleRate(process.env.PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE);
  const request: PerformanceRequestState = {
    ...emptyCounters(),
    correlationId: crypto.randomUUID(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    pendingBoundaries: 1,
    routeCategory,
    sampleRate,
    sampled: Math.random() < sampleRate,
    startedAt: performance.now(),
    totalEmitted: false,
  };

  return requestStorage.run({ activeStages: [], request }, async () => {
    try {
      return await operation();
    } finally {
      releaseBoundary(request);
    }
  });
}

/**
 * Keeps the owning route measurement open while a streamed server component runs.
 * Create the continuation inside withRoutePerformance and invoke it exactly once.
 */
export function deferRoutePerformance(): DeferredPerformanceMeasurement {
  const context = requestStorage.getStore();
  if (!context?.request.sampled) return async <T>(operation: () => Promise<T>) => operation();

  const { request } = context;
  const inheritedStages = context.activeStages;
  request.pendingBoundaries += 1;
  let consumed = false;

  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (consumed) throw new Error("Deferred performance measurement was already consumed.");
    consumed = true;
    return requestStorage.run({ activeStages: inheritedStages, request }, async () => {
      try {
        return await operation();
      } finally {
        releaseBoundary(request);
      }
    });
  };
}

export async function measurePerformanceStage<T>(
  routeCategory: string,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  void routeCategory;
  const parent = requestStorage.getStore();
  if (!parent?.request.sampled) return operation();

  const counters = emptyCounters();
  const startedAt = performance.now();
  // Promise.all can reject while sibling stages still run. Their inherited
  // request context owns those reads even after the route returns its fallback.
  parent.request.pendingBoundaries += 1;
  try {
    return await requestStorage.run(
      { activeStages: [...parent.activeStages, counters], request: parent.request },
      operation,
    );
  } finally {
    try {
      emitPerformanceEvent(parent.request, stage, performance.now() - startedAt, counters);
    } finally {
      releaseBoundary(parent.request);
    }
  }
}

/** @deprecated Route owners must use withRoutePerformance. */
export function emitRequestTotal(_routeCategory: string): void {
  void _routeCategory;
  // Intentionally inert. A total emitted here can race streamed work or compete
  // with the explicit route boundary.
}

export function resolveDiagnosticsSampleRate(configuredValue: string | undefined): number {
  if (configuredValue === undefined || configuredValue.trim() === "") {
    return process.env.NODE_ENV === "production" ? 0.05 : 1;
  }
  const configured = Number(configuredValue);
  if (!Number.isFinite(configured)) return process.env.NODE_ENV === "production" ? 0.05 : 1;
  return Math.min(Math.max(configured, 0), 1);
}

function diagnosticsEnabled(): boolean {
  return process.env.PERFORMANCE_DIAGNOSTICS_ENABLED === "true";
}

function emptyCounters(): PerformanceCounters {
  return {
    authCalls: 0,
    databaseDurationMs: 0,
    databaseQueryCount: 0,
    liveProviderCalls: 0,
  };
}

function incrementCounters(key: "authCalls" | "liveProviderCalls", amount: number): void {
  const context = requestStorage.getStore();
  if (!context?.request.sampled) return;
  context.request[key] += amount;
  for (const stage of context.activeStages) stage[key] += amount;
}

function releaseBoundary(request: PerformanceRequestState): void {
  request.pendingBoundaries -= 1;
  if (request.pendingBoundaries !== 0 || request.totalEmitted || !request.sampled) return;
  request.totalEmitted = true;
  emitPerformanceEvent(request, "total_server", performance.now() - request.startedAt, request);
}

function emitPerformanceEvent(
  request: PerformanceRequestState,
  stage: string,
  durationMs: number,
  counters: PerformanceCounters,
): void {
  console.info(JSON.stringify({
    event: "authenticated_route_performance",
    correlationId: request.correlationId,
    routeCategory: request.routeCategory,
    stage,
    durationMs: round(durationMs),
    databaseQueryCount: counters.databaseQueryCount,
    databaseDurationMs: round(counters.databaseDurationMs),
    authCalls: counters.authCalls,
    liveProviderCalls: counters.liveProviderCalls,
    deployedCommitSha:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local",
    environment: request.environment,
    sampleRate: request.sampleRate,
  }));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
