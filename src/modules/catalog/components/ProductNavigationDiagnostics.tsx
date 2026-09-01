"use client";

import Link from "next/link";
import { useLayoutEffect, useState, type MouseEvent, type ReactNode } from "react";

import type { ProductDetailTab } from "./ProductDetail";

type ResourceSample = {
  decodedBodySize: number;
  duration: number;
  encodedBodySize: number;
  fetchStart: number;
  name: string;
  nextHopProtocol: string;
  requestStart: number;
  responseEnd: number;
  responseStart: number;
  serverTiming: Array<{ description: string; duration: number; name: string }>;
  transferSize: number;
};

type NavigationSample = {
  chunks: ResourceSample[];
  click: number;
  commit: number;
  destination: ProductDetailTab;
  dispatch: number | null;
  firstFrame: number;
  flight: ResourceSample | null;
  longTasks: Array<{ duration: number; startTime: number }>;
  visible: number;
};

type PendingNavigation = {
  click: number;
  destination: ProductDetailTab;
  longTasks: Array<{ duration: number; startTime: number }>;
  observer: PerformanceObserver | null;
};

declare global {
  interface Window {
    __pdpNavigationDiagnostic?: {
      pending: PendingNavigation | null;
      samples: NavigationSample[];
    };
  }
}

const SESSION_KEY = "novotech:pdp-navigation-diagnostic";

export function DiagnosticProductTabLink({
  active,
  children,
  className,
  href,
  tab,
}: {
  active: boolean;
  children: ReactNode;
  className: string;
  href: string;
  tab: ProductDetailTab;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !diagnosticsEnabled()) return;
    const store = getStore();
    store.pending?.observer?.disconnect();
    const click = performance.now();
    const longTasks: PendingNavigation["longTasks"] = [];
    let observer: PerformanceObserver | null = null;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ duration: entry.duration, startTime: entry.startTime });
      });
      observer.observe({ type: "longtask", buffered: true });
    }
    store.pending = { click, destination: tab, longTasks, observer };
    performance.mark(`pdp-click:${tab}`, { startTime: click });
  }

  return <Link aria-current={active ? "page" : undefined} className={className} href={href} onClick={onClick} prefetch={false}>{children}</Link>;
}

export function ProductNavigationDiagnostics({ activeTab }: { activeTab: ProductDetailTab }) {
  const [latest, setLatest] = useState<NavigationSample | null>(null);
  const [control, setControl] = useState<Record<string, unknown> | null>(null);
  const enabled = typeof window !== "undefined" && diagnosticsEnabled();

  useLayoutEffect(() => {
    if (!enabled) return;
    const store = getStore();
    const pending = store.pending;
    if (!pending || pending.destination !== activeTab) return;
    const commit = performance.now();
    const resources = performance.getEntriesByType("resource")
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming && entry.startTime >= pending.click)
      .map(toResourceSample);
    const flight = resources.find((entry) => entry.name.includes("_rsc=")) ?? null;
    pending.observer?.disconnect();
    requestAnimationFrame((firstFrame) => {
      requestAnimationFrame((visible) => {
        const sample: NavigationSample = {
          chunks: resources.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name)),
          click: pending.click,
          commit,
          destination: activeTab,
          dispatch: flight?.fetchStart ?? null,
          firstFrame,
          flight,
          longTasks: pending.longTasks.filter((entry) => entry.startTime >= pending.click && entry.startTime <= visible),
          visible,
        };
        store.samples.push(sample);
        store.pending = null;
        setLatest(sample);
      });
    });
  }, [activeTab, enabled]);

  if (!enabled) return null;

  async function runControl(kind: "public" | "authenticated") {
    const startedAt = performance.now();
    const response = await fetch(`/api/diagnostics/navigation/${kind}?sample=${crypto.randomUUID()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const body = await response.text();
    const completedAt = performance.now();
    const resource = performance.getEntriesByType("resource")
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming && entry.name.includes(`/api/diagnostics/navigation/${kind}`))
      .at(-1);
    setControl({ bodyBytes: new TextEncoder().encode(body).byteLength, completedAt, kind, resource: resource ? toResourceSample(resource) : null, startedAt, status: response.status });
  }

  return (
    <div className="fixed bottom-2 right-2 z-[100] flex gap-2 rounded bg-zinc-950 p-2 text-xs text-white" data-control={control ? JSON.stringify(control) : undefined} data-latest={latest ? JSON.stringify(latest) : undefined} data-sample-count={getStore().samples.length} data-testid="pdp-navigation-diagnostic">
      <button onClick={() => void runControl("public")} type="button">Run public navigation control</button>
      <button onClick={() => void runControl("authenticated")} type="button">Run authenticated navigation control</button>
    </div>
  );
}

function diagnosticsEnabled() {
  if (!location.hostname.endsWith("vercel.app")) return false;
  if (new URL(location.href).searchParams.get("diagnostic") === "nav") sessionStorage.setItem(SESSION_KEY, "1");
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function getStore() {
  return window.__pdpNavigationDiagnostic ??= { pending: null, samples: [] };
}

function toResourceSample(entry: PerformanceResourceTiming): ResourceSample {
  return {
    decodedBodySize: entry.decodedBodySize,
    duration: entry.duration,
    encodedBodySize: entry.encodedBodySize,
    fetchStart: entry.fetchStart,
    name: entry.name,
    nextHopProtocol: entry.nextHopProtocol,
    requestStart: entry.requestStart,
    responseEnd: entry.responseEnd,
    responseStart: entry.responseStart,
    serverTiming: entry.serverTiming.map((item) => ({ description: item.description, duration: item.duration, name: item.name })),
    transferSize: entry.transferSize,
  };
}
