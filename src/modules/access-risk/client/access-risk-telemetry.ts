"use client";

import type { AccessRiskTelemetryEvent } from "../types";

const ENDPOINT = "/api/internal/access-risk/telemetry";
const MAX_BATCH = 20;
const queue: AccessRiskTelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

export function enqueueAccessRiskTelemetry(input: {
  eventName: string;
  route: string;
  productId?: string;
  categoryId?: string;
}): void {
  if (typeof window === "undefined") return;
  queue.push({
    eventName: input.eventName,
    routeFamily: toRouteFamily(input.route),
    occurredAt: new Date().toISOString(),
    productId: input.productId,
    categoryId: input.categoryId,
  });
  attachLifecycleListeners();
  if (queue.length >= MAX_BATCH) flush(false);
  else if (!timer) timer = setTimeout(() => flush(false), 3_000);
}

function flush(useBeacon: boolean): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue.splice(0, MAX_BATCH);
  const payload = JSON.stringify({ batchId: crypto.randomUUID(), events });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
  } else {
    void fetch(ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      credentials: "same-origin", keepalive: true,
    }).catch(() => undefined);
  }
  if (queue.length) timer = setTimeout(() => flush(false), 3_000);
}

function attachLifecycleListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
}

export function toRouteFamily(route: string): string {
  const parts = route.split("?")[0].toLowerCase().split("/").filter(Boolean);
  if (parts[0] !== "cabinet") return "/cabinet";
  return `/${parts.slice(0, 2).map((part) => part.replace(/[^a-z0-9_-]/g, "")).filter(Boolean).join("/")}`;
}
