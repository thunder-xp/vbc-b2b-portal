type PerformanceTimingMetadata = {
  cacheState?: "hit" | "miss" | "request" | "none";
  rowCount?: number;
};

type PerformanceTimingEvent = PerformanceTimingMetadata & {
  durationMs: number;
  event: "server_operation_timing";
  operation: string;
  route: string;
};

export async function measureServerOperation<T>(
  route: string,
  operation: string,
  task: () => Promise<T>,
  metadata: PerformanceTimingMetadata | ((result: T) => PerformanceTimingMetadata) = {},
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await task();
    logPerformanceTiming({
      ...(typeof metadata === "function" ? metadata(result) : metadata),
      durationMs: roundedDuration(startedAt),
      event: "server_operation_timing",
      operation,
      route,
    });
    return result;
  } catch (error) {
    logPerformanceTiming({
      ...(typeof metadata === "function" ? {} : metadata),
      durationMs: roundedDuration(startedAt),
      event: "server_operation_timing",
      operation: `${operation}_failed`,
      route,
    });
    throw error;
  }
}

export function logPerformanceTiming(event: PerformanceTimingEvent): void {
  if (!shouldSamplePerformanceTiming()) return;
  console.info(event);
}

function shouldSamplePerformanceTiming(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const configured = Number(process.env.PERFORMANCE_DIAGNOSTICS_SAMPLE_RATE ?? "0.05");
  const rate = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 1) : 0.05;
  return Math.random() < rate;
}

function roundedDuration(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

