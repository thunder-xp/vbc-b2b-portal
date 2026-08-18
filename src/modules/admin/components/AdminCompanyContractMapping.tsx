"use client";

import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { NOVOTECH_ONE_C_ORGANIZATION_REF } from "@/src/modules/integration/config";

import {
  mapAdminCompanyContractAction,
  refreshAdminCompanyContractDirectoryAction,
  type AdminContractDirectoryRefreshState,
  type AdminContractMappingActionState,
} from "../actions";
import type { AdminCompanyContractMappingProjection, AdminContractCandidate } from "../types";

const INITIAL_MAPPING_STATE: AdminContractMappingActionState = {
  code: null,
  message: "",
  correlationId: null,
  currentPriceTypeRef: null,
  selectedPriceTypeRef: null,
};

const INITIAL_REFRESH_STATE: AdminContractDirectoryRefreshState = {
  status: "idle",
  message: "",
  correlationId: null,
};

export function AdminCompanyContractMapping({
  mapping,
  canRefresh,
}: {
  mapping: AdminCompanyContractMappingProjection;
  canRefresh: boolean;
}) {
  const [selectedRef, setSelectedRef] = useState("");
  const [mappingState, mappingAction, mappingPending] = useActionState(
    mapAdminCompanyContractAction,
    INITIAL_MAPPING_STATE,
  );
  const [refreshState, refreshAction, refreshPending] = useActionState(
    refreshAdminCompanyContractDirectoryAction,
    INITIAL_REFRESH_STATE,
  );
  const selected = useMemo(
    () => mapping.candidates.find((candidate) => candidate.external1cId === selectedRef) ?? null,
    [mapping.candidates, selectedRef],
  );
  const priceMismatch = Boolean(
    selected
      && selected.priceTypeRef?.toLowerCase() !== mapping.currentPriceTypeRef?.toLowerCase(),
  );

  return (
    <section className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">Коммерческий профиль</p>
          <h2 className="mt-1 text-lg font-semibold">Основной договор 1С</h2>
          <p className="mt-1 font-mono text-xs text-zinc-600">
            {mapping.currentContractRef ?? "Не сопоставлен"}
          </p>
        </div>
        {canRefresh ? (
          <form action={refreshAction}>
            <input name="companyId" type="hidden" value={mapping.companyId} />
            <button
              className="inline-flex min-h-11 items-center gap-2 border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
              disabled={refreshPending}
              type="submit"
            >
              <RefreshCw aria-hidden className={`size-4 ${refreshPending ? "animate-spin" : ""}`} />
              {refreshPending ? "Проверка..." : "Повторно проверить в 1С"}
            </button>
          </form>
        ) : null}
      </div>

      {refreshState.message ? (
        <p aria-live="polite" className="mt-3 text-sm text-zinc-700">{refreshState.message}</p>
      ) : null}

      {mapping.canManage ? (
        <details className="mt-5 border-t border-zinc-200 pt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
            {mapping.currentContractRef ? "Изменить договор" : "Сопоставить договор"}
          </summary>
          <form action={mappingAction} className="mt-4 space-y-4">
            <input name="companyId" type="hidden" value={mapping.companyId} />
            <input name="expectedVersion" type="hidden" value={mapping.version} />

            <div className="grid gap-3" role="radiogroup" aria-label="Договоры контрагента из 1С">
              {mapping.candidates.length ? mapping.candidates.map((candidate) => {
                const allowed = isStructurallySelectable(candidate);
                return (
                  <label
                    className={`grid gap-3 border p-4 md:grid-cols-[auto_minmax(0,1fr)] ${
                      allowed ? "border-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-500"
                    }`}
                    key={candidate.external1cId}
                  >
                    <input
                      checked={selectedRef === candidate.external1cId}
                      className="mt-1 size-4"
                      disabled={!allowed}
                      name="contractRef"
                      onChange={() => setSelectedRef(candidate.external1cId)}
                      required
                      type="radio"
                      value={candidate.external1cId}
                    />
                    <ContractFacts candidate={candidate} />
                  </label>
                );
              }) : (
                <p className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  Для точного контрагента нет договоров в опубликованном справочнике 1С.
                </p>
              )}
            </div>

            {priceMismatch && selected ? (
              <div className="flex gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Вид цены не совпадает</p>
                  <p className="mt-1">Текущий профиль: {mapping.currentPriceTypeName ?? mapping.currentPriceTypeRef ?? "не задан"}</p>
                  <p>Договор: {selected.priceTypeName ?? selected.priceTypeRef ?? "не задан"}</p>
                  <p className="mt-1">Сначала синхронизируйте коммерческие данные компании.</p>
                </div>
              </div>
            ) : null}

            <label className="grid gap-1.5 text-sm font-medium">
              Причина ручного сопоставления
              <textarea
                className="min-h-24 border border-zinc-300 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                maxLength={500}
                minLength={10}
                name="reason"
                required
              />
            </label>

            {mappingState.message ? (
              <div
                aria-live="polite"
                className={`flex gap-2 border p-3 text-sm ${
                  mappingState.code === "CONTRACT_MAPPING_SUCCESS"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {mappingState.code === "CONTRACT_MAPPING_SUCCESS" ? (
                  <CheckCircle2 aria-hidden className="size-5 shrink-0" />
                ) : (
                  <ShieldAlert aria-hidden className="size-5 shrink-0" />
                )}
                <span>{mappingState.message}</span>
              </div>
            ) : null}

            <button
              className="min-h-11 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
              disabled={mappingPending || !selectedRef}
              type="submit"
            >
              {mappingPending ? "Сохранение..." : mapping.currentContractRef ? "Изменить договор" : "Сопоставить договор"}
            </button>
          </form>
        </details>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">Изменение доступно только администратору целостности партнёрских данных.</p>
      )}
    </section>
  );
}

function ContractFacts({ candidate }: { candidate: AdminContractCandidate }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{candidate.name}</span>
        {candidate.default ? <span className="border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">Основной в 1С</span> : null}
        {!candidate.active || candidate.deleted ? <span className="border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">Недоступен</span> : null}
      </div>
      <dl className="mt-2 grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <Fact label="Номер" value={candidate.number ?? "Не указан"} />
        <Fact label="Код 1С" value={candidate.code ?? "Не указан"} />
        <Fact label="GUID" value={candidate.external1cId} mono />
        <Fact label="Тип" value={candidate.contractType ?? "Не указан"} />
        <Fact label="Организация" value={candidate.organizationRef ?? "Не указана"} mono />
        <Fact label="Подписан" value={candidate.signed === null ? "Не указано" : candidate.signed ? "Да" : "Нет"} />
        <Fact label="Состояние" value={candidate.deleted ? "Помечен на удаление" : candidate.active ? "Активен" : "Неактивен"} />
        <Fact label="Вид цены" value={candidate.priceTypeName ?? candidate.priceTypeRef ?? "Не указан"} />
        <Fact label="Валюта" value={candidate.currencyCode ?? "Не определена"} />
        <Fact label="Синхронизирован" value={formatDate(candidate.synchronizedAt)} />
      </dl>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className={`break-words ${mono ? "font-mono" : "font-medium"}`}>{value}</dd></div>;
}

function isStructurallySelectable(candidate: AdminContractCandidate): boolean {
  const normalizedType = candidate.contractType?.toLocaleLowerCase("ru-RU").replace(/[^а-яa-z]/g, "");
  return candidate.active
    && !candidate.deleted
    && normalizedType === "спокупателем"
    && candidate.organizationRef?.toLowerCase() === NOVOTECH_ONE_C_ORGANIZATION_REF;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
