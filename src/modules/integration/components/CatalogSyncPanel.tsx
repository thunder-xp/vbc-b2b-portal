"use client";

import { useState, useTransition } from "react";

import { syncCatalogFromOneCAction } from "../actions";
import type { CatalogSyncReport } from "../sync";

export function CatalogSyncPanel() {
  const [isPending, startTransition] = useTransition();
  const [report, setReport] = useState<CatalogSyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSync() {
    setError(null);
    startTransition(async () => {
      const result = await syncCatalogFromOneCAction();

      if (!result.success) {
        setReport(null);
        setError(result.message);
        return;
      }

      setReport(result.data);
    });
  }

  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Catalog synchronization
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Manual import of categories, brands, and products from the
            configured ERP provider into the catalog read model.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isPending ? "Synchronizing..." : "Run catalog sync"}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {report ? <CatalogSyncReportView report={report} /> : null}
    </section>
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
