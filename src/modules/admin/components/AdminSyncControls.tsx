"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import {
  runAdminSyncAction,
  type AdminCatalogSyncResult,
} from "../actions";
import type { AdminSyncDomain } from "../types";

const ACTIONS: ReadonlyArray<readonly [AdminSyncDomain, string]> = [
  ["rates", "Курсы"],
  ["catalog", "Каталог"],
  ["prices", "Цены"],
  ["stock", "Остатки"],
  ["commercial", "Все коммерческие данные"],
  ["active_orders", "Активные заказы"],
  ["order_history", "История заказов"],
  ["finance", "Финансы"],
  ["product_relations", "Связи товаров"],
];

export function AdminSyncControls() {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [catalogResult, setCatalogResult] = useState<AdminCatalogSyncResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(domain: AdminSyncDomain) {
    startTransition(async () => {
      const result = await runAdminSyncAction(domain, reason);
      setMessage(result.message);
      setCatalogResult(result.success && result.data.domain === "catalog" ? result.data.catalog : null);
    });
  }

  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold">Ручной запуск</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Каждый запуск требует причину и записывается в журнал аудита.
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor="sync-reason">
        Причина запуска
      </label>
      <textarea
        className="mt-2 min-h-20 w-full border border-zinc-300 px-3 py-2 text-sm"
        id="sync-reason"
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        value={reason}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS.map(([domain, label]) => (
          <button
            className="inline-flex items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            disabled={pending || reason.trim().length < 3}
            key={domain}
            onClick={() => run(domain)}
            type="button"
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {message ? (
        <p aria-live="polite" className="mt-4 text-sm text-zinc-700">
          {message}
        </p>
      ) : null}
      {catalogResult ? <CatalogSyncResult result={catalogResult} /> : null}
    </section>
  );
}

function CatalogSyncResult({ result }: { result: AdminCatalogSyncResult }) {
  const stages = [
    ["Источник / B2B", result.sourceB2BStatus],
    ["Public Retail projection", result.publicRetailProjectionStatus],
    ["Public Retail publication", result.publicRetailPublicationStatus],
    ["Общий результат", result.overallStatus],
  ] as const;

  return (
    <div className="mt-4" data-testid="catalog-sync-stage-result">
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map(([label, status]) => (
          <div className="border border-zinc-200 bg-zinc-50 p-3" key={label}>
            <dt className="text-xs font-medium text-zinc-600">{label}</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-900">
              {stageLabel(status)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 break-all text-xs text-zinc-500">
        Run ID: {result.runId ?? "-"}
        {result.publicationId ? ` · Publication ID: ${result.publicationId}` : ""}
      </p>
    </div>
  );
}

function stageLabel(status: "succeeded" | "queued" | "failed") {
  if (status === "succeeded") return "Завершено";
  if (status === "queued") return "В очереди";
  return "Ошибка";
}
