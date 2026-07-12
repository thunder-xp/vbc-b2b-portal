export type PriceSyncLaunchResult = { status: 200 | 202; requestId: string | null; durationMs: number; route: string };

export class PriceSyncLaunchError extends Error {
  constructor(readonly safeMessage: string, readonly status: number | null = null) { super("Price synchronization continuation launch failed."); this.name = "PriceSyncLaunchError"; }
}

export async function launchPriceSync(syncId: string, requestOrigin?: string | null): Promise<PriceSyncLaunchResult> {
  const secret = process.env.PRICE_SYNC_SECRET ?? process.env.CRON_SECRET;
  if (!secret) throw new PriceSyncLaunchError("Price synchronization secret is not configured.");
  const route = resolvePriceSyncInternalUrl(requestOrigin).toString();
  const startedAt = Date.now();
  console.info({ event: "price_sync_initial_launch_started", syncId, stage: "continuation_launch", route: "/api/internal/price-sync" });
  let response: Response;
  try {
    response = await fetch(route, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ syncId }), cache: "no-store", signal: AbortSignal.timeout(4_000) });
  } catch {
    console.error({ event: "price_sync_initial_launch_failed", syncId, stage: "continuation_launch", route: "/api/internal/price-sync", status: null });
    throw new PriceSyncLaunchError("Internal endpoint could not be reached.");
  }
  const durationMs = Date.now() - startedAt;
  const requestId = response.headers.get("x-vercel-id") ?? response.headers.get("x-request-id");
  if (response.status !== 200 && response.status !== 202) {
    console.error({ event: "price_sync_initial_launch_failed", syncId, stage: "continuation_launch", route: "/api/internal/price-sync", status: response.status, requestId });
    throw new PriceSyncLaunchError(`Internal endpoint returned ${response.status}.`, response.status);
  }
  console.info({ event: "price_sync_initial_launch_accepted", syncId, stage: "continuation_launch", route: "/api/internal/price-sync", status: response.status, requestId, durationMs });
  return { status: response.status, requestId, durationMs, route } as PriceSyncLaunchResult;
}

export function resolvePriceSyncInternalUrl(requestOrigin?: string | null): URL {
  const configured = [process.env.PRICE_SYNC_INTERNAL_BASE_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, requestOrigin].find((value) => value?.trim());
  if (!configured) throw new PriceSyncLaunchError("Price synchronization internal base URL is not configured.");
  const normalized = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return new URL("/api/internal/price-sync", normalized.replace(/\/+$/, ""));
}
