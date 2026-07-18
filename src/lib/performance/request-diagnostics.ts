import "server-only";

import { cache } from "react";

type PerformanceRequestState = {
  authCalls: number;
  correlationId: string;
  databaseDurationMs: number;
  databaseQueryCount: number;
  liveProviderCalls: number;
  startedAt: number;
};

const diagnosticsEnabled = process.env.PERFORMANCE_DIAGNOSTICS_ENABLED === "true";

const getRequestState = cache((): PerformanceRequestState => ({
  authCalls: 0,
  correlationId: crypto.randomUUID(),
  databaseDurationMs: 0,
  databaseQueryCount: 0,
  liveProviderCalls: 0,
  startedAt: performance.now(),
}));

export function recordAuthCall(): void {
  if (diagnosticsEnabled) getRequestState().authCalls += 1;
}

export function recordDatabaseQuery(durationMs: number): void {
  if (!diagnosticsEnabled) return;
  const state = getRequestState();
  state.databaseQueryCount += 1;
  state.databaseDurationMs += durationMs;
}

export function recordLiveProviderCall(): void {
  if (diagnosticsEnabled) getRequestState().liveProviderCalls += 1;
}

export async function measurePerformanceStage<T>(
  routeCategory: string,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!diagnosticsEnabled) return operation();
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    emitPerformanceEvent(routeCategory, stage, performance.now() - startedAt);
  }
}

export function emitRequestTotal(routeCategory: string): void {
  if (!diagnosticsEnabled) return;
  const state = getRequestState();
  emitPerformanceEvent(routeCategory, "total_server", performance.now() - state.startedAt);
}

function emitPerformanceEvent(routeCategory: string, stage: string, durationMs: number): void {
  const state = getRequestState();
  console.info(JSON.stringify({
    event: "authenticated_route_performance",
    correlationId: state.correlationId,
    routeCategory,
    stage,
    durationMs: round(durationMs),
    databaseQueryCount: state.databaseQueryCount,
    databaseDurationMs: round(state.databaseDurationMs),
    authCalls: state.authCalls,
    liveProviderCalls: state.liveProviderCalls,
    cacheStatus: "request_scoped",
    deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  }));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
