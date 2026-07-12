"use client";

import { useEffect, useState, useTransition } from "react";
import { getDailyCatalogSyncStateAction, getPriceSyncStateAction, getStockSyncStateAction, runDailyCatalogSyncAction, syncPricesFromOneCAction, syncStockFromOneCAction } from "../actions";
import type { CatalogSyncState, PriceSyncState, StockSyncState } from "../sync";

export function CatalogSyncPanel() {
  const [catalogPending, startCatalog] = useTransition();
  const [pricePending, startPrice] = useTransition();
  const [stockPending, startStock] = useTransition();
  const [state, setState] = useState<CatalogSyncState | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [priceState, setPriceState] = useState<PriceSyncState | null>(null);
  const [stockState, setStockState] = useState<StockSyncState | null>(null);

  useEffect(() => { void reloadState(); void reloadPriceState(); void reloadStockState(); }, []);
  useEffect(() => { if (!priceState || !["queued", "running"].includes(priceState.status)) return; const timer = window.setInterval(() => void reloadPriceState(), 3000); return () => window.clearInterval(timer); }, [priceState?.status]);
  useEffect(()=>{if(!stockState||!["queued","running"].includes(stockState.status))return;const timer=window.setInterval(()=>void reloadStockState(),3000);return()=>window.clearInterval(timer);},[stockState?.status]);
  async function reloadState() { const result = await getDailyCatalogSyncStateAction(); if (result.success) setState(result.data); }
  async function reloadPriceState() { const result = await getPriceSyncStateAction(); if (result.success) setPriceState(result.data); }
  async function reloadStockState(){const result=await getStockSyncStateAction();if(result.success)setStockState(result.data);}
  function runCatalog() { if (catalogPending) return; startCatalog(async () => { const result = await runDailyCatalogSyncAction(); setCatalogMessage(result.message); if (result.success) setState(result.data); else await reloadState(); }); }
  function runPrices() { if (pricePending) return; startPrice(async () => { const result = await syncPricesFromOneCAction(); if (result.success) setPriceState(result.data); }); }
  function runStock() { if (stockPending) return; startStock(async () => { const result = await syncStockFromOneCAction(); if(result.success)setStockState(result.data); }); }

  return <div className="space-y-6">
    <SyncSection title="Catalog structure and products" description="Синхронизирует структуру категорий и товары из группы SECURITYPARK DISTRIBUTION.">
      <div className="flex flex-wrap gap-2"><ActionButton pending={catalogPending} onClick={runCatalog}>Run full catalog sync</ActionButton><ActionButton pending={catalogPending} secondary onClick={runCatalog}>Retry failed catalog sync</ActionButton></div>
      {catalogMessage && <p className="text-sm text-slate-700">{catalogMessage}</p>}
      {state ? <CatalogStateView state={state} /> : <p className="text-sm text-slate-500">Loading synchronization status...</p>}
    </SyncSection>
    <SyncSection title="Partner prices" description="Обновляет цены из 1С для доступных типов цен.">
      <div className="flex flex-wrap gap-2"><ActionButton pending={pricePending} onClick={runPrices}>Run price sync now</ActionButton><ActionButton pending={pricePending} secondary onClick={runPrices}>Retry failed price sync</ActionButton></div>
      <Report rows={priceState ? [["Status", priceStatus(priceState)], ["Current stage", priceState.currentStage ?? "-"], ["Started", priceState.startedAt ?? "Never"], ["Last successful run", priceState.lastSuccessfulSyncAt ?? "Never"], ["Pages processed", priceState.pagesProcessed], ["Rows scanned", priceState.rowsScanned], ["Rows staged", priceState.rowsStaged], ["Price rows received", priceState.priceRowsReceived], ["Unique price keys", priceState.priceUniqueKeys], ["Duplicate price keys", priceState.priceDuplicateKeys], ["Price rows deduplicated", priceState.priceRowsDeduplicated], ["Latest prices resolved", priceState.latestPricesResolved], ["Prices published", priceState.pricesPublished], ["Prices deactivated", priceState.pricesDeactivated], ["Unmatched products", priceState.unmatchedProducts], ["Unknown price types", priceState.unknownPriceTypes], ["Scan complete", String(priceState.scanComplete)], ["Failed page", priceState.failedPage ?? "None"], ["Failed stage", priceState.failedStage ?? "None"], ["Database error code", priceState.databaseErrorCode ?? "None"], ["Safe error", priceState.safeError ?? priceState.errorCategory ?? "None"], ["Last update", priceState.updatedAt]] : []} />
    </SyncSection>
    <SyncSection title="Inventory and stock" description="Обновляет остатки и доступность товаров.">
      <div className="flex gap-2"><ActionButton pending={stockPending} onClick={runStock}>Run stock sync now</ActionButton><ActionButton pending={stockPending} secondary onClick={runStock}>Retry failed stock sync</ActionButton></div>
      <Report rows={stockState?[["Status",stockState.status],["Current stage",stockState.currentStage??"-"],["Snapshot time",stockState.snapshotTime??"-"],["Pages processed",stockState.pagesProcessed],["Physical rows",stockState.physicalRows],["Reserved rows",stockState.reservedRows],["Incoming rows",stockState.incomingRows],["Warehouses loaded",stockState.warehousesLoaded],["Products matched",stockState.productsMatched],["Products unmatched",stockState.productsUnmatched],["Rows published",stockState.rowsPublished],["Rows deactivated",stockState.rowsDeactivated],["Safe error",stockState.safeError??"None"],["Last successful run",stockState.lastSuccessfulSyncAt??"Never"]]:[]} />
    </SyncSection>
  </div>;
}

function SyncSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>{children}</section>; }
function ActionButton({ pending, secondary = false, onClick, children }: { pending: boolean; secondary?: boolean; onClick: () => void; children: React.ReactNode }) { return <button className={secondary ? "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50" : "rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"} disabled={pending} onClick={onClick} type="button">{pending ? "Running..." : children}</button>; }
function Report({ rows }: { rows: Array<[string, string | number]> }) { return rows.length ? <dl className="grid gap-3 sm:grid-cols-4">{rows.map(([label, value]) => <div className="rounded-md bg-slate-50 p-3" key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-950">{value}</dd></div>)}</dl> : <p className="text-sm text-slate-500">Not run in this session.</p>; }
function CatalogStateView({ state }: { state: CatalogSyncState }) {
  const d = state.diagnostics;
  const rows: Array<[string, string | number]> = [["Root status", state.rootName ? "Found" : "Not found"], ["Root name", state.rootName ?? "-"], ["Last status", state.status], ["Last successful run", state.lastSuccessfulSyncAt ?? "Never"], ["Pages", state.pagesProcessed], ["Folders received", state.foldersReceived], ["Products received", state.productsReceived], ["Folders upserted", state.foldersUpserted], ["Products upserted", state.productsUpserted], ["Rows deactivated", state.rowsDeactivated], ["Error category", state.errorCategory ?? "None"], ["Failed stage", state.failedStage ?? "None"], ["Database error code", state.databaseErrorCode ?? "None"], ["Database constraint", state.databaseConstraint ?? "None"], ["Failed batch", state.failedBatch ?? "None"], ["Next run", state.nextScheduledRun]];
  if (d) rows.push(["Configured ordering", d.configuredOrdering], ["Total rows scanned", d.totalRowsScanned], ["Unique rows scanned", d.uniqueRowsScanned], ["Duplicate references", d.duplicateReferenceCount], ["Folder rows scanned", d.folderRowsScanned], ["Product rows scanned", d.productRowsScanned], ["Valid parent references", d.validParentReferences], ["Rows directly under root", d.rowsWithParentEqualRoot], ["Direct child folders", d.directChildFolders], ["Direct child products", d.directChildProducts], ["Descendant folders", d.descendantFoldersResolved], ["Descendant products", d.descendantProductsResolved], ["Eligible products", d.eligibleProducts], ["Excluded deleted", d.excludedDeleted], ["Excluded inactive", d.excludedInactive], ["Excluded invalid GUID", d.excludedInvalidGuid], ["Excluded service", d.excludedService], ["Excluded set", d.excludedSet], ["Excluded empty name", d.excludedEmptyName], ["Excluded outside subtree", d.excludedOutsideSubtree], ["Page size", d.pageSize], ["Last page rows", d.lastPageRowCount], ["Scan complete", String(d.scanComplete)], ["Accounting type counts", JSON.stringify(d.accountingTypeCounts)], ["Set values true / false / missing", `${d.setValueCounts.true} / ${d.setValueCounts.false} / ${d.setValueCounts.missing}`]);
  if (d) rows.push(["Property definitions", d.propertyDefinitionsLoaded ?? 0], ["Products with image", d.productsWithImageUrl ?? 0], ["Products without image", d.productsWithoutImageUrl ?? 0], ["Invalid image URLs", d.invalidImageUrls ?? 0], ["Products with description", d.productsWithFullDescription ?? 0], ["Products with attributes", d.productsWithAttributes ?? 0], ["Attribute rows received", d.attributeRowsReceived ?? 0], ["Unique attribute pairs", d.attributeUniquePairs ?? 0], ["Duplicate attribute pairs", d.attributeDuplicatePairs ?? 0], ["Multi-value merges", d.attributeMultiValueMerges ?? 0], ["Attribute batches staged", d.attributeBatchesStaged ?? 0], ["Attribute rows published", d.attributeRowsPublished ?? 0], ["Attribute transaction succeeded", String(d.attributePublicationTransactionSucceeded ?? false)], ["Attribute rows removed", d.attributeRowsRemoved ?? 0], ["Filterable attributes", d.filterableAttributeRows ?? 0]);
  return <Report rows={rows} />;
}

function priceStatus(state: PriceSyncState): string { return state.status === "queued" && Date.now() - Date.parse(state.updatedAt) > 120_000 ? "Continuation has not started" : state.status; }
