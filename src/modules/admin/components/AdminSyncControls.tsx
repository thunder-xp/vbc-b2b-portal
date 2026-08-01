"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { runAdminSyncAction } from "../actions";
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
  const [pending, startTransition] = useTransition();

  function run(domain: AdminSyncDomain) {
    startTransition(async () => {
      const result = await runAdminSyncAction(domain, reason);
      setMessage(result.message);
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
    </section>
  );
}
