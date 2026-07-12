"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";

import {
  syncCatalogFromOneCAction,
  getCatalogSyncStateAction,
  syncPricesFromOneCAction,
  syncStockFromOneCAction,
} from "../actions";
import type { CatalogSyncReport, CatalogSyncState, PriceSyncReport, StockSyncReport } from "../sync";

export function CatalogSyncPanel() {
  const [isCatalogPending, startCatalogTransition] = useTransition();
  const [isPricePending, startPriceTransition] = useTransition();
  const [isStockPending, startStockTransition] = useTransition();
  const [catalogReport, setCatalogReport] = useState<CatalogSyncReport | null>(
    null,
  );
  const [priceReport, setPriceReport] = useState<PriceSyncReport | null>(null);
  const [stockReport, setStockReport] = useState<StockSyncReport | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<CatalogSyncState | null>(null);

  useEffect(() => { void getCatalogSyncStateAction().then((result) => { if (result.success) setCatalogState(result.data); }); }, []);

  function handleCatalogSync() {
    setCatalogError(null);
    startCatalogTransition(async () => {
      const result = await syncCatalogFromOneCAction();

      if (!result.success) {
        setCatalogReport(null);
        setCatalogError(result.message);
        return;
      }

      setCatalogReport(result.data);
    });
  }

  function handlePriceSync() {
    setPriceError(null);
    startPriceTransition(async () => {
      const result = await syncPricesFromOneCAction();

      if (!result.success) {
        setPriceReport(null);
        setPriceError(result.message);
        return;
      }

      setPriceReport(result.data);
    });
  }

  function handleStockSync() {
    setStockError(null);
    startStockTransition(async () => {
      const result = await syncStockFromOneCAction();

      if (!result.success) {
        setStockReport(null);
        setStockError(result.message);
        return;
      }

      setStockReport(result.data);
    });
  }

  return (
    <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            ERP synchronization
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Manual import from the configured ERP provider into approved portal
            read models.
          </p>
        </div>
      </div>

      <SyncSection
        buttonLabel={isCatalogPending ? "Synchronizing..." : "Run full sync now"}
        description="Imports categories, brands, and products. Does not import prices, stock, orders, documents, or finance."
        disabled={isCatalogPending}
        error={catalogError}
        onRun={handleCatalogSync}
        title="Catalog synchronization"
        secondaryButtonLabel="Retry last failed sync"
        onSecondaryRun={handleCatalogSync}
      >
        {catalogState ? <CatalogSyncStateView state={catalogState} /> : null}
        {catalogReport ? <CatalogSyncReportView report={catalogReport} /> : null}
      </SyncSection>

      <SyncSection
        buttonLabel={isPricePending ? "Synchronizing..." : "Run price sync"}
        description="Imports product price snapshots into the pricing read model. Does not calculate discounts or official commercial terms."
        disabled={isPricePending}
        error={priceError}
        onRun={handlePriceSync}
        title="Price synchronization"
      >
        {priceReport ? <PriceSyncReportView report={priceReport} /> : null}
      </SyncSection>

      <SyncSection
        buttonLabel={isStockPending ? "Synchronizing..." : "Run stock sync"}
        description="Imports product stock snapshots into the inventory read model. Does not create reservations, orders, or warehouse workflows."
        disabled={isStockPending}
        error={stockError}
        onRun={handleStockSync}
        title="Stock synchronization"
      >
        {stockReport ? <StockSyncReportView report={stockReport} /> : null}
      </SyncSection>
    </section>
  );
}

function SyncSection({
  buttonLabel,
  children,
  description,
  disabled,
  error,
  onRun,
  onSecondaryRun,
  secondaryButtonLabel,
  title,
}: {
  buttonLabel: string;
  children: ReactNode;
  description: string;
  disabled: boolean;
  error: string | null;
  onRun: () => void;
  onSecondaryRun?: () => void;
  secondaryButtonLabel?: string;
  title: string;
}) {
  return (
    <div className="space-y-4 rounded-md border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {buttonLabel}
        </button>{secondaryButtonLabel && onSecondaryRun ? <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50" disabled={disabled} onClick={onSecondaryRun} type="button">{secondaryButtonLabel}</button> : null}</div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {children}
    </div>
  );
}

function CatalogSyncReportView({ report }: { report: CatalogSyncReport }) {
  const rows = [
    {
      label: "Categories",
      received: report.categoriesReceived,
      created: report.categoriesCreated,
      updated: report.categoriesUpdated,
    },
    {
      label: "Brands",
      received: report.brandsReceived,
      created: report.brandsCreated,
      updated: report.brandsUpdated,
    },
    {
      label: "Products",
      received: report.productsReceived,
      created: report.productsCreated,
      updated: report.productsUpdated,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Provider" value={report.provider} />
        <Metric label="Status" value={report.status} />
        <Metric label="Failed" value={String(report.failed)} />
        <Metric label="Duration" value={`${report.durationMs} ms`} />
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.received}</td>
                <td className="px-4 py-3 text-slate-700">{row.created}</td>
                <td className="px-4 py-3 text-slate-700">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.errors.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Sync notices</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CatalogSyncStateView({ state }: { state: CatalogSyncState }) {
  return <div className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-3 lg:grid-cols-5">
    <Metric label="Root" value={state.rootName ?? "Not found"} />
    <Metric label="Last status" value={state.status} />
    <Metric label="Last successful" value={state.lastSuccessfulSyncAt ?? "Never"} />
    <Metric label="Duration" value={state.durationMs === null ? "-" : `${state.durationMs} ms`} />
    <Metric label="Next run" value={state.nextScheduledRun} />
    <Metric label="Pages" value={String(state.pagesProcessed)} />
    <Metric label="Folders received" value={String(state.foldersReceived)} />
    <Metric label="Products received" value={String(state.productsReceived)} />
    <Metric label="Folders upserted" value={String(state.foldersUpserted)} />
    <Metric label="Products upserted" value={String(state.productsUpserted)} />
    <Metric label="Rows deactivated" value={String(state.rowsDeactivated)} />
    <Metric label="Error category" value={state.errorCategory ?? "None"} />
  </div>;
}

function PriceSyncReportView({ report }: { report: PriceSyncReport }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Provider" value={report.provider} />
        <Metric label="Status" value={report.status} />
        <Metric label="Failed" value={String(report.failed)} />
        <Metric label="Duration" value={`${report.durationMs} ms`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Received" value={String(report.pricesReceived)} />
        <Metric label="Created" value={String(report.pricesCreated)} />
        <Metric label="Updated" value={String(report.pricesUpdated)} />
        <Metric label="Skipped" value={String(report.pricesSkipped)} />
      </div>

      {report.errors.length > 0 || report.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Sync notices</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {[...report.errors, ...report.warnings].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StockSyncReportView({ report }: { report: StockSyncReport }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Provider" value={report.provider} />
        <Metric label="Status" value={report.status} />
        <Metric label="Failed" value={String(report.failed)} />
        <Metric label="Duration" value={`${report.durationMs} ms`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Received" value={String(report.stockReceived)} />
        <Metric label="Created" value={String(report.stockCreated)} />
        <Metric label="Updated" value={String(report.stockUpdated)} />
        <Metric label="Skipped" value={String(report.stockSkipped)} />
      </div>

      {report.errors.length > 0 || report.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Sync notices</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {[...report.errors, ...report.warnings].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
