export async function invokePriceSyncContinuation(origin: string, syncId: string): Promise<void> {
  return invoke(origin, { command: "continue", syncId });
}

export async function invokePriceSyncStart(origin: string): Promise<void> {
  return invoke(origin, { command: "start" });
}

async function invoke(origin: string, command: { command: "start" } | { command: "continue"; syncId: string }): Promise<void> {
  const secret = process.env.PRICE_SYNC_SECRET ?? process.env.CRON_SECRET;
  if (!secret) throw new Error("Price synchronization secret is not configured.");
  const url = new URL("/api/internal/price-sync", origin);
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  if (!response.ok) console.error({ event: "price_sync_continuation_failed", statusCode: response.status });
}
