"use client";

import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { useActionState } from "react";

import {
  applyAdminCompanyOneCSyncAction,
  discoverAdminCompanyOneCSyncAction,
  type AdminOneCManualSyncActionState,
} from "../actions";
import type {
  AdminCompanyOverview,
  AdminOneCManualSyncCandidate,
  AdminOneCManualSyncEvent,
} from "../types";

const INITIAL_STATE: AdminOneCManualSyncActionState = {
  status: "idle",
  message: "",
  correlationId: null,
  errorCode: null,
  discovery: null,
  result: null,
};

export function AdminCompanyOneCManualSync({
  company,
  events,
}: {
  company: AdminCompanyOverview;
  events: AdminOneCManualSyncEvent[];
}) {
  const [discoveryState, discoverAction, discoveryPending] = useActionState(
    discoverAdminCompanyOneCSyncAction,
    INITIAL_STATE,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyAdminCompanyOneCSyncAction,
    INITIAL_STATE,
  );
  const discovery = discoveryState.discovery;
  const nsCandidates = discovery?.candidates.filter((candidate) => candidate.nsCandidate) ?? [];
  const cashCandidates = discovery?.candidates ?? [];

  return (
    <section className="border border-zinc-200 bg-white p-5" data-testid="manual-one-c-sync">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">Управляемая проверка</p>
          <h2 className="mt-1 text-lg font-semibold">Синхронизация коммерческих данных с 1С</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Запрашивает свежие данные только для текущего контрагента. Изменения применяются после сравнения и отдельного подтверждения.
          </p>
        </div>
        <span className={`border px-2 py-1 text-xs font-semibold ${
          company.external1cId ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"
        }`}>
          {company.external1cId ? "Привязка контрагента проверяется повторно" : "Привязка отсутствует"}
        </span>
      </div>

      <form action={discoverAction} className="mt-5 flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-4">
        <input name="companyId" type="hidden" value={company.companyId} />
        {!company.external1cId ? (
          <label className="grid min-w-72 flex-1 gap-1.5 text-sm font-medium">
            Фискальный код, код 1С или точный Ref_Key
            <input className="min-h-11 border border-zinc-300 px-3" maxLength={100} name="query" required />
          </label>
        ) : null}
        <button
          className="inline-flex min-h-11 items-center gap-2 bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={discoveryPending}
          type="submit"
        >
          <RefreshCw aria-hidden className={`size-4 ${discoveryPending ? "animate-spin" : ""}`} />
          {discoveryPending ? "Запрос к 1С..." : "Синхронизировать с 1С"}
        </button>
      </form>

      {discoveryState.message ? <ActionMessage state={discoveryState} /> : null}

      {discovery ? (
        <div className="mt-5 space-y-5">
          <dl className="grid gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm md:grid-cols-4">
            <Fact label="Контрагент" value={discovery.counterparty.name} />
            <Fact label="Код 1С" value={discovery.counterparty.code} mono />
            <Fact label="Ref_Key" value={discovery.counterparty.reference} mono />
            <Fact label="Последняя проверка" value={formatDate(discovery.verifiedAt)} />
          </dl>

          <div className="overflow-x-auto border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-3 py-2">Поле</th><th className="px-3 py-2">До</th><th className="px-3 py-2">Предложение 1С</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <Comparison label="Основной договор" before={discovery.previous.mainContractRef} after={discovery.proposed.mainContractRef} />
                <Comparison label="Наличный договор" before={discovery.previous.cashContractRef} after={discovery.proposed.cashContractRef} />
                <Comparison label="Вид цены" before={discovery.previous.priceTypeRef} after={discovery.proposed.priceTypeRef} />
                <Comparison label="Готовность" before={discovery.previous.readiness} after="Будет пересчитана после публикации" />
              </tbody>
            </table>
          </div>

          {discovery.errors.length ? (
            <div className="flex gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <ShieldAlert aria-hidden className="size-5 shrink-0" />
              <div><p className="font-semibold">Результаты проверки</p><p className="mt-1">{discovery.errors.join(", ")}</p></div>
            </div>
          ) : null}

          <form action={applyAction} className="space-y-4 border-t border-zinc-200 pt-5">
            <input name="expectedContractVersion" type="hidden" value={discovery.contractMappingVersion} />
            <input name="expectedCashVersion" type="hidden" value={discovery.cashMappingVersion} />
            <input name="expectedProfileVersion" type="hidden" value={discovery.commercialProfileVersion} />
            <input name="companyId" type="hidden" value={company.companyId} />
            <CandidateGroup
              candidates={nsCandidates}
              defaultRef={discovery.proposed.mainContractRef}
              legend="Основной безналичный договор NS"
              name="mainContractRef"
            />
            <CandidateGroup
              candidates={cashCandidates}
              defaultRef={discovery.proposed.cashContractRef}
              legend="Наличный договор — отдельное назначение администратора"
              name="cashContractRef"
            />
            <label className="grid gap-1.5 text-sm font-medium">
              Причина синхронизации
              <textarea
                className="min-h-20 border border-zinc-300 p-3"
                defaultValue="Проверка и публикация коммерческих данных по актуальному состоянию 1С"
                maxLength={500}
                minLength={10}
                name="reason"
                required
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-1 size-4" name="confirmed" required type="checkbox" value="yes" />
              <span>Я проверил точные ссылки, договоры, организацию, вид цены и валюты.</span>
            </label>
            <button
              className="min-h-11 bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={applyPending || !discovery.canApply}
              type="submit"
            >
              {applyPending ? "Повторная проверка и публикация..." : "Подтвердить и применить"}
            </button>
          </form>
        </div>
      ) : null}

      {applyState.message ? <ActionMessage state={applyState} /> : null}
      {applyState.result?.status === "success" ? (
        <dl className="mt-4 grid gap-3 border border-emerald-200 bg-emerald-50 p-4 text-sm md:grid-cols-4">
          <Fact label="Готовность" value={applyState.result.readiness ?? "—"} />
          <Fact label="Основной договор" value={applyState.result.mainContractRef ?? "—"} mono />
          <Fact label="Наличный договор" value={applyState.result.cashContractRef ?? "—"} mono />
          <Fact label="Вид цены" value={applyState.result.priceTypeRef ?? "—"} mono />
        </dl>
      ) : null}

      {events.length ? (
        <details className="mt-5 border-t border-zinc-200 pt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">Последние ручные синхронизации</summary>
          <ol className="mt-2 divide-y divide-zinc-200 text-sm">
            {events.map((event) => (
              <li className="py-3" key={event.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{event.outcomeCode === "published" ? "Снимок опубликован" : "Изменений нет"}</span>
                  <time className="text-zinc-500">{formatDate(event.occurredAt)}</time>
                </div>
                <p className="mt-1 text-zinc-700">{event.reason}</p>
                <p className="mt-1 font-mono text-xs text-zinc-500">{event.counterpartyRef}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function CandidateGroup({
  candidates,
  defaultRef,
  legend,
  name,
}: {
  candidates: AdminOneCManualSyncCandidate[];
  defaultRef: string | null;
  legend: string;
  name: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      {name === "cashContractRef" ? (
        <label className="flex items-center gap-3 border border-zinc-300 p-3 text-sm">
          <input defaultChecked={defaultRef === null} name={name} type="radio" value="" />
          Сохранить текущее наличное сопоставление без изменений
        </label>
      ) : null}
      {candidates.length ? candidates.map((candidate) => (
        <label className={`block border p-3 text-sm ${candidate.eligible ? "border-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`} key={candidate.contractRef}>
          <span className="flex items-start gap-3">
            <input defaultChecked={candidate.contractRef === defaultRef} disabled={!candidate.eligible} name={name} required={name === "mainContractRef"} type="radio" value={candidate.contractRef} />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{candidate.name} · {candidate.number ?? "без номера"}</span>
              <span className="mt-1 block break-all font-mono text-xs">{candidate.contractRef}</span>
              <span className="mt-2 block text-xs">
                Тип: {candidate.contractType ?? "—"} · Организация: {candidate.organizationRef ?? "—"} · Вид цены: {candidate.priceTypeName ?? "Не подтверждён"} ({candidate.priceTypeRef ?? "—"}) · Статус цены: {candidate.priceTypeActive ? "Подтверждён" : "Недоступен"} · Допуск: {candidate.eligible ? "Допустим" : "Недопустим"} · Валюта расчётов: {candidate.settlementCurrencyRef ?? "—"} · Валюта цены: {candidate.priceCurrencyRef ?? "—"}
              </span>
              {!candidate.eligible ? <span className="mt-1 block font-semibold text-amber-800">{candidate.blockingCode}</span> : null}
            </span>
          </span>
        </label>
      )) : <p className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Кандидаты не найдены.</p>}
    </fieldset>
  );
}

function Comparison({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  return <tr><th className="px-3 py-2 font-medium">{label}</th><td className="break-all px-3 py-2 font-mono text-xs">{before ?? "—"}</td><td className="break-all px-3 py-2 font-mono text-xs">{after ?? "Требуется выбор"}</td></tr>;
}

function ActionMessage({ state }: { state: AdminOneCManualSyncActionState }) {
  const success = state.status === "success" || state.status === "discovered";
  return (
    <div aria-live="polite" className={`mt-4 flex gap-2 border p-3 text-sm ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
      {success ? <CheckCircle2 aria-hidden className="size-5 shrink-0" /> : <ShieldAlert aria-hidden className="size-5 shrink-0" />}
      <span>{state.message}</span>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className={`break-words ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
