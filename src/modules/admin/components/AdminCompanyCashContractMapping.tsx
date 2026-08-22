"use client";

import { CheckCircle2, ShieldAlert, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import {
  mapAdminCompanyCashContractAction,
  removeAdminCompanyCashContractAction,
  type AdminCashContractMappingActionState,
} from "../actions";
import type { AdminCompanyContractMappingProjection } from "../types";

const INITIAL_STATE: AdminCashContractMappingActionState = {
  code: null,
  message: "",
  correlationId: null,
};

export function AdminCompanyCashContractMapping({
  mapping,
}: {
  mapping: AdminCompanyContractMappingProjection;
}) {
  const [selectedRef, setSelectedRef] = useState(mapping.cashMapping.active ? mapping.cashMapping.contractRef ?? "" : "");
  const [mapState, mapAction, mapPending] = useActionState(mapAdminCompanyCashContractAction, INITIAL_STATE);
  const [removeState, removeAction, removePending] = useActionState(removeAdminCompanyCashContractAction, INITIAL_STATE);
  const selected = useMemo(
    () => mapping.candidates.find((candidate) => candidate.external1cId === selectedRef) ?? null,
    [mapping.candidates, selectedRef],
  );
  const state = removeState.message ? removeState : mapState;

  return (
    <section className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">Форма оплаты</p>
          <h2 className="mt-1 text-lg font-semibold">Договор для наличной оплаты</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Назначается явно администратором. Название или описание договора не определяет форму оплаты.
          </p>
        </div>
        <Status mapping={mapping} />
      </div>

      {mapping.canManage ? (
        <form action={mapAction} className="mt-5 space-y-4 border-t border-zinc-200 pt-4">
          <input name="companyId" type="hidden" value={mapping.companyId} />
          <input name="expectedVersion" type="hidden" value={mapping.cashMapping.version} />
          <div className="grid gap-3" role="radiogroup" aria-label="Договор для наличной оплаты">
            {mapping.candidates.map((candidate) => (
              <label
                className={`grid gap-3 border p-4 md:grid-cols-[auto_minmax(0,1fr)] ${
                  candidate.cashQualified ? "border-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-500"
                }`}
                key={candidate.external1cId}
              >
                <input
                  checked={selectedRef === candidate.external1cId}
                  className="mt-1 size-4"
                  disabled={!candidate.cashQualified}
                  name="contractRef"
                  onChange={() => setSelectedRef(candidate.external1cId)}
                  required
                  type="radio"
                  value={candidate.external1cId}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{candidate.name}</span>
                    {candidate.cashQualified ? (
                      <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">Допустим</span>
                    ) : (
                      <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-950">
                        {qualificationLabel(candidate.cashQualificationCode)}
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2 xl:grid-cols-3">
                    <Fact label="Номер" value={candidate.number ?? "Не указан"} />
                    <Fact label="Код 1С" value={candidate.code ?? "Не указан"} />
                    <Fact label="Тип" value={candidate.contractType ?? "Не указан"} />
                    <Fact label="Организация" value={candidate.organizationRef ?? "Не указана"} mono />
                    <Fact label="Вид цены" value={candidate.priceTypeName ?? candidate.priceTypeRef ?? "Не указан"} />
                    <Fact label="Валюта" value={candidate.currencyCode ?? "Не определена"} />
                  </dl>
                </div>
              </label>
            ))}
          </div>

          <label className="grid gap-1.5 text-sm font-medium">
            Причина сопоставления
            <textarea
              className="min-h-24 border border-zinc-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              maxLength={500}
              minLength={10}
              name="reason"
              required
            />
          </label>

          <button
            className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
            disabled={mapPending || !selected?.cashQualified}
            type="submit"
          >
            {mapPending ? "Сохранение..." : mapping.cashMapping.active ? "Изменить сопоставление" : "Сопоставить договор"}
          </button>
        </form>
      ) : null}

      {mapping.canManage && mapping.cashMapping.active ? (
        <form action={removeAction} className="mt-4 grid gap-3 border-t border-zinc-200 pt-4">
          <input name="companyId" type="hidden" value={mapping.companyId} />
          <input name="expectedVersion" type="hidden" value={mapping.cashMapping.version} />
          <label className="grid gap-1.5 text-sm font-medium">
            Причина удаления сопоставления
            <input className="min-h-11 border border-zinc-300 px-3" minLength={10} maxLength={500} name="reason" required />
          </label>
          <button
            className="inline-flex min-h-11 w-fit items-center gap-2 border border-red-300 px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
            disabled={removePending}
            type="submit"
          >
            <Trash2 aria-hidden className="size-4" />
            {removePending ? "Удаление..." : "Удалить сопоставление"}
          </button>
        </form>
      ) : null}

      {state.message ? (
        <p aria-live="polite" className={`mt-4 border p-3 text-sm ${state.code === "CASH_CONTRACT_MAPPING_SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {state.message}
        </p>
      ) : null}

      {mapping.cashMapping.events.length ? (
        <details className="mt-5 border-t border-zinc-200 pt-4">
          <summary className="min-h-11 cursor-pointer font-semibold">История сопоставления</summary>
          <ol className="mt-3 divide-y divide-zinc-200 text-sm">
            {mapping.cashMapping.events.map((event) => (
              <li className="py-3" key={event.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{eventTypeLabel(event.eventType)}</span>
                  <time className="text-zinc-500">{formatDate(event.occurredAt)}</time>
                </div>
                <p className="mt-1 text-zinc-700">{event.reason}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function Status({ mapping }: { mapping: AdminCompanyContractMappingProjection }) {
  const valid = mapping.cashMapping.qualified;
  return (
    <div className={`flex max-w-md gap-2 border p-3 text-sm ${valid ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      {valid ? <CheckCircle2 aria-hidden className="size-5 shrink-0" /> : <ShieldAlert aria-hidden className="size-5 shrink-0" />}
      <div>
        <p className="font-semibold">{valid ? "Сопоставление действительно" : qualificationLabel(mapping.cashMapping.qualificationCode)}</p>
        {mapping.cashMapping.contractRef ? <p className="mt-1 font-mono text-xs">{mapping.cashMapping.contractRef}</p> : null}
      </div>
    </div>
  );
}

function qualificationLabel(code: string): string {
  return ({
    CASH_MAPPING_MISSING: "Сопоставление отсутствует",
    CASH_MAPPING_REMOVED: "Сопоставление удалено",
    CASH_COMPANY_INACTIVE: "Компания неактивна",
    CASH_CONTRACT_NOT_FOUND: "Договор не найден",
    CASH_CONTRACT_NOT_OWNED_BY_COMPANY: "Другой контрагент",
    CASH_CONTRACT_INACTIVE: "Договор неактивен",
    CASH_CONTRACT_INVALID_TYPE: "Неверный тип договора",
    CASH_CONTRACT_ORGANIZATION_MISMATCH: "Другая организация",
    CASH_CONTRACT_PRICE_TYPE_MISSING: "Нет вида цены",
    CASH_CONTRACT_PRICE_TYPE_INVALID: "Вид цены недействителен",
    CASH_CONTRACT_CURRENCY_MISSING: "Нет валюты договора",
    CASH_CONTRACT_CURRENCY_MISMATCH: "Валюта не совпадает",
    CASH_CONTRACT_QUALIFIED: "Сопоставление действительно",
  } as Record<string, string>)[code] ?? "Требуется проверка";
}

function eventTypeLabel(type: "mapped" | "changed" | "removed"): string {
  return { mapped: "Договор сопоставлен", changed: "Сопоставление изменено", removed: "Сопоставление удалено" }[type];
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className={`break-words ${mono ? "font-mono" : "font-medium"}`}>{value}</dd></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
