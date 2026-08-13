export const WORKER_COORDINATION_CODES = [
  "already_completed",
  "lease_lost",
  "replayed_page",
  "run_not_found",
  "stale_cursor",
  "stale_source",
  "superseded",
] as const;

export type WorkerCoordinationCode = (typeof WORKER_COORDINATION_CODES)[number];

export type WorkerCoordinationResult = {
  status: "coordination_conflict";
  code: WorkerCoordinationCode;
  runId: string | null;
};

export function getWorkerCoordinationResult(value: unknown): WorkerCoordinationResult | null {
  if (!isRecord(value) || value.status !== "coordination_conflict") return null;
  if (!WORKER_COORDINATION_CODES.includes(value.code as WorkerCoordinationCode)) return null;
  return {
    status: "coordination_conflict",
    code: value.code as WorkerCoordinationCode,
    runId: typeof value.runId === "string" ? value.runId : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
