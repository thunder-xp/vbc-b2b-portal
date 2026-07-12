"use client";

import { useEffect, useState, useTransition } from "react";
import { getDailyCatalogSyncStateAction, runDailyCatalogSyncAction, syncPricesFromOneCAction, syncStockFromOneCAction } from "../actions";
import type { CatalogSyncState, PriceSyncReport, StockSyncReport } from "../sync";

export function CatalogSyncPanel() {
  const [catalogPending, startCatalog] = useTransition();
  const [pricePending, startPrice] = useTransition();
  const [stockPending, startStock] = useTransition();
  const [state, setState] = useState<CatalogSyncState | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [priceReport, setPriceReport] = useState<PriceSyncReport | null>(null);
  const [stockReport, setStockReport] = useState<StockSyncReport | null>(null);

  useEffect(() => { void reloadState(); }, []);
  async function reloadState() { const result = await getDailyCatalogSyncStateAction(); if (result.success) setState(result.data); }
  function runCatalog() { if (catalogPending) return; startCatalog(async () => { const result = await runDailyCatalogSyncAction(); setCatalogMessage(result.message); if (result.success) setState(result.data); else await reloadState(); }); }
  function runPrices() { if (pricePending) return; startPrice(async () => { const result = await syncPricesFromOneCAction(); setPriceReport(result.success ? result.data : null); }); }
  function runStock() { if (stockPending) return; startStock(async () => { const result = await syncStockFromOneCAction(); setStockReport(result.success ? result.data : null); }); }

  return <div className="space-y-6">
    <SyncSection title="Catalog structure and products" description="Синхронизирует структуру категорий и товары из группы SECURITYPARK DISTRIBUTION.">
      <div className="flex flex-wrap gap-2"><ActionButton pending={catalogPending} onClick={runCatalog}>Run full catalog sync</ActionButton><ActionButton pending={catalogPending} secondary onClick={runCatalog}>Retry failed catalog sync</ActionButton></div>
      {catalogMessage && <p className="text-sm text-slate-700">{catalogMessage}</p>}
      {state ? <CatalogStateView state={state} /> : <p className="text-sm text-slate-500">Loading synchronization status...</p>}
    </SyncSection>
    <SyncSection title="Partner prices" description="Обновляет цены из 1С для доступных типов цен.">
      <ActionButton pending={pricePending} onClick={runPrices}>Run price sync now</ActionButton>
      <Report rows={priceReport ? [["Last price sync status", priceReport.status], ["Rows received", priceReport.pricesReceived], ["Rows upserted", priceReport.pricesCreated + priceReport.pricesUpdated], ["Rows failed", priceReport.failed]] : []} />
    </SyncSection>
    <SyncSection title="Inventory and stock" description="Обновляет остатки и доступность товаров.">
      <ActionButton pending={stockPending} onClick={runStock}>Run stock sync now</ActionButton>
      <Report rows={stockReport ? [["Last stock sync status", stockReport.status], ["Rows received", stockReport.stockReceived], ["Rows upserted", stockReport.stockCreated + stockReport.stockUpdated], ["Rows failed", stockReport.failed]] : []} />
    </SyncSection>
  </div>;
}

function SyncSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>{children}</section>; }
function ActionButton({ pending, secondary = false, onClick, children }: { pending: boolean; secondary?: boolean; onClick: () => void; children: React.ReactNode }) { return <button className={secondary ? "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50" : "rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"} disabled={pending} onClick={onClick} type="button">{pending ? "Running..." : children}</button>; }
function Report({ rows }: { rows: Array<[string, string | number]> }) { return rows.length ? <dl className="grid gap-3 sm:grid-cols-4">{rows.map(([label, value]) => <div className="rounded-md bg-slate-50 p-3" key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-950">{value}</dd></div>)}</dl> : <p className="text-sm text-slate-500">Not run in this session.</p>; }
function CatalogStateView({ state }: { state: CatalogSyncState }) {
  const d = state.diagnostics;
  const rows: Array<[string, string | number]> = [["Root status", state.rootName ? "Found" : "Not found"], ["Root name", state.rootName ?? "-"], ["Last status", state.status], ["Last successful run", state.lastSuccessfulSyncAt ?? "Never"], ["Pages", state.pagesProcessed], ["Folders received", state.foldersReceived], ["Products received", state.productsReceived], ["Folders upserted", state.foldersUpserted], ["Products upserted", state.productsUpserted], ["Rows deactivated", state.rowsDeactivated], ["Error category", state.errorCategory ?? "None"], ["Failed stage", state.failedStage ?? "None"], ["Next run", state.nextScheduledRun]];
  if (d) rows.push(["Total rows scanned", d.totalRowsScanned], ["Folder rows scanned", d.folderRowsScanned], ["Product rows scanned", d.productRowsScanned], ["Valid parent references", d.validParentReferences], ["Rows directly under root", d.rowsWithParentEqualRoot], ["Direct child folders", d.directChildFolders], ["Direct child products", d.directChildProducts], ["Descendant folders", d.descendantFoldersResolved], ["Descendant products", d.descendantProductsResolved], ["Excluded deleted", d.excludedDeleted], ["Excluded invalid GUID", d.excludedInvalidGuid], ["Excluded service", d.excludedService], ["Excluded set", d.excludedSet], ["Excluded empty name", d.excludedEmptyName], ["Excluded outside subtree", d.excludedOutsideSubtree], ["Page size", d.pageSize], ["Last page rows", d.lastPageRowCount], ["Scan complete", String(d.scanComplete)], ["Accounting type counts", JSON.stringify(d.accountingTypeCounts)], ["Set values true / false / missing", `${d.setValueCounts.true} / ${d.setValueCounts.false} / ${d.setValueCounts.missing}`]);
  return <Report rows={rows} />;
}
