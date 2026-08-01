"use client";

import { useEffect, useState } from "react";

import { getProductRelationDiagnosticsAction } from "../../integration/actions";
import type { ProductRelationHealth, ProductRelationInspectionRow, ProductRelationQuality } from "../repositories/supabase-product-relation-admin.repository";

export function ProductRelationAdminPanel() {
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<{ health: ProductRelationHealth; quality: ProductRelationQuality; rows: ProductRelationInspectionRow[] } | null>(null);
  useEffect(() => {
    void getProductRelationDiagnosticsAction().then((result) => {
      if (result.success) setData(result.data);
      else setMessage(result.message);
    });
  }, []);
  const run = data?.health.latestRun;
  return (
    <section className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-semibold">Связи товаров из 1С</h2><p className="mt-1 text-sm text-zinc-600">Только чтение. Источник связей изменяется исключительно в 1С.</p></div>
      </div>
      {message ? <p aria-live="polite" className="mt-3 text-sm text-zinc-700">{message}</p> : null}
      {data ? <>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Статус провайдера" value={String(run?.status ?? "нет запусков")} />
          <Metric label="Активная блокировка" value={data.health.activeLock ? "да" : "нет"} />
          <Metric label="Опубликовано" value={data.health.published} />
          <Metric label="Аналоги получены" value={numberValue(run?.analog_rows_received)} />
          <Metric label="Сопутствующие получены" value={numberValue(run?.related_rows_received)} />
          <Metric label="Длительность, мс" value={numberValue(run?.duration_ms)} />
          <Metric label="Без связей" value={data.health.distribution.zero} />
          <Metric label="Одна связь" value={data.health.distribution.one} />
          <Metric label="2–5 связей" value={data.health.distribution.twoToFive} />
          <Metric label="Больше 5" value={data.health.distribution.overFive} />
          <Metric label="Без аналогов" value={data.quality.withoutAnalogs} />
          <Metric label="Без сопутствующих" value={data.quality.withoutRelated} />
          <Metric label="Нераспознанные источники" value={numberValue(run?.unmapped_sources)} />
          <Metric label="Нераспознанные цели" value={numberValue(run?.unmapped_targets)} />
          <Metric label="Неактивные цели" value={numberValue(run?.inactive_targets)} />
          <Metric label="Неопубликованные цели" value={numberValue(run?.unpublished_targets)} />
          <Metric label="Вне каталога" value={numberValue(run?.outside_scope_targets)} />
          <Metric label="Самоссылки" value={numberValue(run?.self_relations)} />
          <Metric label="Дубликаты" value={numberValue(run?.duplicate_rows)} />
          <Metric label="Некорректные строки" value={numberValue(run?.malformed_rows)} />
          <Metric label="Строки с характеристиками" value={numberValue(run?.characteristic_rows)} />
          <Metric label="Меньше 2 аналогов" value={data.quality.fewerThanTwoAnalogs} />
          <Metric label="Меньше 2 сопутствующих" value={data.quality.fewerThanTwoRelated} />
        </dl>
        <div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-zinc-200"><th className="px-2 py-2">Исходный товар</th><th className="px-2 py-2">Тип</th><th className="px-2 py-2">Связанный товар</th><th className="px-2 py-2">Публикация</th></tr></thead><tbody>{data.rows.map((row) => <tr className="border-b border-zinc-100" key={`${row.sourceSku}:${row.relationType}:${row.targetSku}`}><td className="px-2 py-2"><strong>{row.sourceSku}</strong><br />{row.sourceName}</td><td className="px-2 py-2">{row.relationType === "analog" ? "Аналог" : "Сопутствующий"}</td><td className="px-2 py-2"><strong>{row.targetSku}</strong><br />{row.targetName}</td><td className="px-2 py-2">{row.targetActive && row.targetVisible ? "Опубликован" : "Недоступен"}</td></tr>)}</tbody></table></div>
      </> : <p className="mt-4 text-sm text-zinc-500">Загрузка диагностики...</p>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) { return <div className="bg-zinc-50 p-3"><dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function numberValue(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
