"use client";

import { useEffect, useState, useTransition } from "react";

import { getDailyCatalogSyncStateAction, runDailyCatalogSyncAction } from "../actions";
import type { CatalogSyncState } from "../sync";

export function CatalogSyncPanel() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<CatalogSyncState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { void reloadState(); }, []);
  async function reloadState() { const result = await getDailyCatalogSyncStateAction(); if (result.success) setState(result.data); }
  function runFullSync() {
    if (pending) return;
    setMessage(null); setFailed(false);
    startTransition(async () => {
      const result = await runDailyCatalogSyncAction();
      setMessage(result.message); setFailed(!result.success);
      if (result.success) setState(result.data); else await reloadState();
    });
  }

  return <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
    <div><h2 className="text-lg font-semibold text-slate-950">Ежедневная синхронизация каталога</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Синхронизирует структуру категорий и товары из группы SECURITYPARK DISTRIBUTION. Цены и остатки обновляются отдельно.</p></div>
    <div className="flex flex-wrap gap-2"><button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={pending} onClick={runFullSync} type="button">{pending ? "Синхронизация..." : "Run full sync now"}</button><button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} onClick={runFullSync} type="button">Retry last failed sync</button></div>
    {message && <div className={`rounded-md border px-4 py-3 text-sm ${failed ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</div>}
    {state ? <CatalogSyncStateView state={state} /> : <p className="text-sm text-slate-500">Loading synchronization status...</p>}
  </section>;
}

function CatalogSyncStateView({ state }: { state: CatalogSyncState }) {
  const rows = [["Root status", state.rootName ? "Found" : "Not found"], ["Root name", state.rootName ?? "-"], ["Last status", state.status], ["Last successful run", state.lastSuccessfulSyncAt ?? "Never"], ["Duration", state.durationMs === null ? "-" : `${state.durationMs} ms`], ["Pages", state.pagesProcessed], ["Folders received", state.foldersReceived], ["Products received", state.productsReceived], ["Folders upserted", state.foldersUpserted], ["Products upserted", state.productsUpserted], ["Rows deactivated", state.rowsDeactivated], ["Error category", state.errorCategory ?? "None"], ["Failed stage", state.failedStage ?? "None"], ["Next run", state.nextScheduledRun]];
  return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <div className="rounded-md bg-slate-50 p-3" key={String(label)}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-950">{String(value)}</dd></div>)}</dl>;
}
