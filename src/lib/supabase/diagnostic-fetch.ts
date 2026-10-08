import "server-only";

import { recordDatabaseQuery } from "@/src/lib/performance/request-diagnostics";

/** Observe the outbound boundary identically for authenticated and admin reads. */
export async function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    if (isPostgrestRequest(input)) recordDatabaseQuery(performance.now() - startedAt);
  }
}

function isPostgrestRequest(input: RequestInfo | URL): boolean {
  const rawUrl = input instanceof Request ? input.url : input.toString();
  try {
    return new URL(rawUrl).pathname.startsWith("/rest/v1/");
  } catch {
    return false;
  }
}
