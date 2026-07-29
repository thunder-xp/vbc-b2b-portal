"use client";

import { useState, useTransition } from "react";

import { startRetailPriceHistoryBackfillAction } from "../../integration/actions";
import type { AdminRetailPriceHistoryHealth } from "../types";

export function AdminRetailPriceHistoryBackfill({
  health,
}: {
  health: AdminRetailPriceHistoryHealth;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = health.latestBackfill;
  const blocked = health.verification.status !== "verified"
    || latest?.status === "requested"
    || latest?.status === "running";

  return (
    <section aria-labelledby="retail-history-backfill" className="border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-950" id="retail-history-backfill">
        История розничных цен
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Защищённая загрузка подтверждённых RETAIL-цен из 1С. Текущие опубликованные цены не изменяются.
      </p>

      {latest ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Статус" value={statusLabel(latest.status)} />
          <Metric label="Строк источника" value={latest.source_rows} />
          <Metric label="Сопоставлено товаров" value={latest.mapped_products} />
          <Metric label="Точек после сокращения" value={latest.reduced_change_points} />
          <Metric label="Добавлено точек" value={latest.inserted_change_points} />
          <Metric label="Не сопоставлено" value={latest.unresolved_products} />
          <Metric label="Совпадения с текущей ценой" value={latest.continuity_matches} />
          <Metric label="Расхождения" value={latest.continuity_mismatches} />
        </dl>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-zinc-800" htmlFor="retail-history-reason">
        Причина запуска
      </label>
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        id="retail-history-reason"
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Укажите проверяемую деловую причину загрузки"
        value={reason}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={blocked || pending || reason.trim().length < 20}
          onClick={() => startTransition(async () => {
            const result = await startRetailPriceHistoryBackfillAction(reason);
            setMessage(result.message);
          })}
          type="button"
        >
          {pending ? "Запуск..." : "Загрузить историю розничных цен"}
        </button>
        {message ? <p aria-live="polite" className="text-sm text-zinc-700">{message}</p> : null}
      </div>
      {health.openIncidentCount > 0 ? (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Обнаружены расхождения с текущими ценами: {health.openIncidentCount}. Текущие цены не изменены.
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>;
}

function statusLabel(status: NonNullable<AdminRetailPriceHistoryHealth["latestBackfill"]>["status"]) {
  return {
    requested: "В очереди",
    running: "Выполняется",
    succeeded: "Завершено",
    failed: "Ошибка",
  }[status];
}
