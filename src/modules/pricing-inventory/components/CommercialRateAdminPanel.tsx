"use client";

import { CheckCircle2, History, Info, ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import type { ActionResult } from "../../access-control/actions/action-result";
import { publishCommercialRateAction } from "../actions";
import type { CommercialRateAdminDto, CommercialRateAdminRowDto } from "../services";
import type { CommercialRate } from "../types";

const INITIAL_STATE: ActionResult<CommercialRate | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};

export function CommercialRateAdminPanel({ data }: { data: CommercialRateAdminDto }) {
  return (
    <div className="space-y-6">
      <div className="border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <div className="flex items-start gap-3">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          <p>Коммерческие курсы подтверждаются вручную по данным 1С. Текущий стандартный OData 1С не предоставляет конечный BCRU/RTL курс для автоматической публикации.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {data.rates.map((row) => <CommercialRatePublicationForm key={row.purpose} row={row} />)}
      </div>

      <section aria-labelledby="commercial-rate-history" className="space-y-3">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="size-4 text-emerald-700" />
          <h2 className="text-lg font-semibold" id="commercial-rate-history">История подтверждений</h2>
        </div>
        {data.history.length === 0 ? (
          <p className="border border-dashed border-zinc-300 bg-white px-5 py-10 text-center text-sm text-zinc-500">Курсы ещё не публиковались.</p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-4 py-3">Коммерческий курс</th><th className="px-4 py-3">Курс</th><th className="px-4 py-3">Дата действия</th><th className="px-4 py-3">Опубликовано</th><th className="px-4 py-3">Кем</th><th className="px-4 py-3">Источник</th><th className="px-4 py-3">Статус</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.history.map((rate) => (
                  <tr key={rate.id}>
                    <td className="px-4 py-3 font-medium">{purposeLabel(rate.purpose)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatRate(rate.rate)}</td>
                    <td className="px-4 py-3">{formatDate(rate.effectiveAt)}</td>
                    <td className="px-4 py-3">{formatDateTime(rate.publishedAt)}</td>
                    <td className="px-4 py-3">{rate.publisherName || rate.publisherEmail || "Внутренний пользователь"}</td>
                    <td className="max-w-72 px-4 py-3 text-zinc-600"><span className="block text-zinc-800">Ручное подтверждение по данным 1С</span><span className="mt-1 block text-xs">{rate.sourceNote}</span></td>
                    <td className="px-4 py-3"><Status active={rate.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CommercialRatePublicationForm({ row }: { row: CommercialRateAdminRowDto }) {
  const [state, action, pending] = useActionState(publishCommercialRateAction, INITIAL_STATE);
  return (
    <section className="border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-3">
        <div>
          <h2 className="text-base font-semibold">{purposeDirection(row.purpose)}</h2>
          <p className="mt-1 text-xs text-zinc-500">{purposeDescription(row.purpose)}</p>
        </div>
        <Status active={Boolean(row.current)} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-zinc-200 py-4 text-sm">
        <div className="col-span-2"><dt className="text-xs text-zinc-500">Текущий курс</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">{row.current ? formatRate(row.current.rate) : "Не опубликован"}</dd></div>
        <Metric label="Дата действия" value={row.current ? formatDate(row.current.effectiveAt) : "—"} />
        <Metric label="Опубликовано" value={row.current ? formatDateTime(row.current.publishedAt) : "—"} />
        <div className="col-span-2"><dt className="text-xs text-zinc-500">Источник</dt><dd className="mt-1 font-semibold text-zinc-950">Ручное подтверждение по данным 1С</dd></div>
        {row.current ? <details className="col-span-2 text-xs text-zinc-600"><summary className="cursor-pointer font-medium text-zinc-700">Подтверждающие сведения</summary><p className="mt-2">{row.current.sourceNote}</p>{row.current.evidenceComment ? <p className="mt-1">{row.current.evidenceComment}</p> : null}</details> : null}
      </dl>

      <form action={action} className="mt-4 grid gap-4">
        <input name="purpose" type="hidden" value={row.purpose} />
        <input name="currentRateId" type="hidden" value={row.current?.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Курс<input className="mt-1 h-10 w-full border border-zinc-300 px-3 tabular-nums" defaultValue={row.current?.rate} inputMode="decimal" max="1000" min="0.00000001" name="rate" required step="0.00000001" /></label>
          <label className="text-sm font-medium">Дата действия<input className="mt-1 h-10 w-full border border-zinc-300 px-3" defaultValue={row.current?.effectiveAt.slice(0, 10) ?? today()} name="effectiveDate" required type="date" /></label>
        </div>
        <label className="text-sm font-medium">Источник / примечание<input className="mt-1 h-10 w-full border border-zinc-300 px-3" defaultValue={row.current?.sourceNote ?? "Курс скопирован из 1С"} maxLength={500} minLength={3} name="sourceNote" required /></label>
        <label className="text-sm font-medium">Комментарий к подтверждению <span className="font-normal text-zinc-500">(необязательно)</span><textarea className="mt-1 min-h-20 w-full border border-zinc-300 px-3 py-2" defaultValue={row.current?.evidenceComment ?? ""} maxLength={1000} name="evidenceComment" /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex h-10 items-center gap-2 bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50" disabled={pending} type="submit"><ShieldCheck aria-hidden="true" className="size-4" />{pending ? "Публикация..." : "Опубликовать"}</button>
          {state.message ? <p className={state.success ? "text-sm text-emerald-700" : "text-sm text-rose-700"} role="status">{state.message}</p> : null}
        </div>
      </form>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-zinc-950">{value}</dd></div>; }
function Status({ active }: { active: boolean }) { return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${active ? "text-emerald-700" : "text-zinc-500"}`}>{active ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : null}{active ? "Активен" : "Архив"}</span>; }
function purposeLabel(purpose: CommercialRate["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "BCRU 113 · партнёрская USD → MDL" : "RTL 999 · MSRP USD → MDL"; }
function purposeDirection(purpose: CommercialRate["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "BCRU 113 · USD → MDL" : "RTL 999 · USD → MDL"; }
function purposeDescription(purpose: CommercialRate["purpose"]) { return purpose === "partner_price_usd_to_mdl" ? "Коммерческий курс партнёрской цены" : "Коммерческий курс розничной цены"; }
function formatRate(rate: number) { return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 4, maximumFractionDigits: 8 }).format(rate); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function today() { return new Date().toISOString().slice(0, 10); }
