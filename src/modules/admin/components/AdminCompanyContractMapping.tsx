"use client";

import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import {
  mapAdminCompanyContractAction,
  synchronizeAdminCompanyCommercialProfileAction,
  type AdminCommercialProfileSyncActionState,
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

const INITIAL_SYNC_STATE: AdminCommercialProfileSyncActionState = {
  code: null,
  message: "",
  correlationId: null,
};

export function AdminCompanyContractMapping({
  mapping,
}: {
  mapping: AdminCompanyContractMappingProjection;
}) {
  const [selectedRef, setSelectedRef] = useState(mapping.suggestedContractRef ?? "");
  const [mappingState, mappingAction, mappingPending] = useActionState(
    mapAdminCompanyContractAction,
    INITIAL_MAPPING_STATE,
  );
  const [syncState, syncAction, syncPending] = useActionState(
    synchronizeAdminCompanyCommercialProfileAction,
    INITIAL_SYNC_STATE,
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
      </div>

      <CommercialReadinessStatus mapping={mapping} />
      <CommercialProfileFacts mapping={mapping} />

      {mapping.canSync && mapping.currentContractRef ? (
        <form action={syncAction} className="mt-5 grid gap-3 border-t border-zinc-200 pt-4">
          <input name="companyId" type="hidden" value={mapping.companyId} />
          <input name="expectedVersion" type="hidden" value={mapping.commercialProfileVersion} />
          <label className="grid gap-1.5 text-sm font-medium">
            Причина обновления
            <input
              className="min-h-11 border border-zinc-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              defaultValue="Проверка коммерческого профиля по основному договору 1С"
              maxLength={500}
              minLength={10}
              name="reason"
              required
            />
          </label>
          <button
            className="inline-flex min-h-11 w-fit items-center gap-2 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60"
            disabled={syncPending}
            type="submit"
          >
            <RefreshCw aria-hidden className={`size-4 ${syncPending ? "animate-spin" : ""}`} />
            {syncPending
              ? "Проверка..."
              : mapping.commercialProfileState === "mismatch"
                ? "Применить данные из 1С"
                : "Обновить коммерческий профиль из 1С"}
          </button>
        </form>
      ) : null}

      {syncState.message ? (
        <p
          aria-live="polite"
          className={`mt-3 border p-3 text-sm ${syncState.code === "COMMERCIAL_PROFILE_SYNC_SUCCESS" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}
        >
          {syncState.message}
        </p>
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
              {mapping.defaultContractAmbiguous ? (
                <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  В 1С опубликовано несколько разных основных договоров. Выберите договор после проверки источника.
                </p>
              ) : null}
              {mapping.candidates.length ? mapping.candidates.map((candidate) => {
                const allowed = candidate.selectable;
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
                  <p className="mt-1">Сопоставление сохранит договор, а коммерческий профиль останется неизменным до отдельного подтверждённого обновления из 1С.</p>
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
              {mappingPending
                ? "Сохранение..."
                : mapping.currentContractRef
                  ? "Изменить договор"
                  : selectedRef === mapping.suggestedContractRef && selectedRef
                    ? "Сопоставить основной договор"
                    : "Сопоставить договор"}
            </button>
          </form>
        </details>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">Изменение доступно только администратору целостности партнёрских данных.</p>
      )}
    </section>
  );
}

function CommercialReadinessStatus({ mapping }: { mapping: AdminCompanyContractMappingProjection }) {
  const readiness = mapping.readiness;
  const tone = readiness.ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : readiness.severity === "high"
      ? "border-red-300 bg-red-50 text-red-950"
      : "border-amber-300 bg-amber-50 text-amber-950";
  return (
    <div className={`mt-5 border p-4 ${tone}`} data-testid="commercial-readiness-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Готовность к оформлению: {readinessClassLabel(readiness.class)}</p>
        {!readiness.ready ? (
          <span className="border border-current px-2 py-0.5 text-xs font-semibold uppercase">
            Приоритет: {severityLabel(readiness.severity)}
          </span>
        ) : null}
      </div>
      {!readiness.ready ? (
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Fact label="Коммерческое последствие" value={commercialConsequenceLabel(readiness.class)} />
          <Fact label="Требуемое действие" value={requiredActionLabel(readiness.class)} />
          <Fact
            label="Последняя проверка"
            value={readiness.lastVerifiedAt ? formatDate(readiness.lastVerifiedAt) : "Профиль ещё не подтверждён"}
          />
          <Fact
            label="Активная корзина"
            value={readiness.activeCartItemCount > 0
              ? `${readiness.activeCartItemCount} позиций — покупатель заблокирован`
              : "Пустая"}
          />
        </dl>
      ) : (
        <p className="mt-2 text-sm">Коммерческий профиль и доступный способ оплаты подтверждены.</p>
      )}
    </div>
  );
}

function CommercialProfileFacts({ mapping }: { mapping: AdminCompanyContractMappingProjection }) {
  const contract = mapping.candidates.find(
    (candidate) => candidate.external1cId.toLowerCase() === mapping.currentContractRef?.toLowerCase(),
  );
  const mismatch = mapping.commercialProfileState === "mismatch";
  return (
    <div className="mt-5 border-y border-zinc-200 py-4">
      {mismatch && contract ? (
        <div className="mb-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p><strong>Текущий профиль платформы:</strong> {mapping.currentPriceTypeName ?? "Не назначен"}</p>
          <p><strong>Основной договор 1С:</strong> {contract.priceTypeName ?? "Вид цены не указан"}</p>
        </div>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <Fact label="Контрагент 1С" value={mapping.counterpartyRef ?? "Не сопоставлен"} mono />
        <Fact label="Договор" value={contract ? `${contract.code ?? "Без кода"} · ${contract.number ?? contract.name}` : "Не сопоставлен"} />
        <Fact label="Организация" value={contract?.organizationRef ?? "Не определена"} mono />
        <Fact label="Подписан" value={contract?.signed === null || contract?.signed === undefined ? "Не указано" : contract.signed ? "Да" : "Нет"} />
        <Fact label="Вид цены договора" value={contract?.priceTypeName ?? contract?.priceTypeRef ?? "Не указан"} />
        <Fact label="Опубликованный профиль" value={mapping.currentPriceTypeName ?? "Не назначен"} />
        <Fact label="Статус партнёра" value={mapping.currentPriceTypeName ?? "Не назначен"} />
        <Fact label="Валюта" value={mapping.currentCurrencyCode ?? "Не определена"} />
        <Fact label="Последняя проверка" value={mapping.commercialProfileVerifiedAt ? formatDate(mapping.commercialProfileVerifiedAt) : "Ещё не проверен"} />
        <Fact label="Состояние" value={profileStateLabel(mapping.commercialProfileState)} />
      </dl>
    </div>
  );
}

function ContractFacts({ candidate }: { candidate: AdminContractCandidate }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{candidate.name}</span>
        {candidate.default ? <span className="border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">Основной в 1С</span> : null}
        {!candidate.active || candidate.deleted ? <span className="border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">Недоступен</span> : null}
        {!candidate.selectable ? <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-950">{contractQualificationLabel(candidate)}</span> : null}
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
        <Fact label="Договорная валюта" value={candidate.settlementCurrencyCode ?? candidate.settlementCurrencyRef ?? "Не определена"} />
        <Fact label="Валюта цен" value={candidate.priceCurrencyCode ?? candidate.priceCurrencyRef ?? "Не определена"} />
        <Fact label="Синхронизирован" value={formatDate(candidate.synchronizedAt)} />
      </dl>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className={`break-words ${mono ? "font-mono" : "font-medium"}`}>{value}</dd></div>;
}

function contractQualificationLabel(candidate: AdminContractCandidate): string {
  if (candidate.qualificationCode === "CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH") {
    return `Валюта вида цены не соответствует опубликованному виду цены: ${candidate.priceCurrencyRef ?? "источник не указан"} / ${candidate.priceCurrencyCode ?? "локальная валюта не указана"}`;
  }
  return ({
    CONTRACT_NOT_FOUND: "Договор не найден",
    CONTRACT_NOT_OWNED_BY_COMPANY: "Другой контрагент",
    CONTRACT_INACTIVE: "Договор неактивен",
    CONTRACT_INVALID_TYPE: "Неверный тип договора",
    CONTRACT_ORGANIZATION_MISMATCH: "Другая организация",
    CONTRACT_PRICE_TYPE_MISSING: "Вид цены не указан",
    CONTRACT_PRICE_TYPE_INVALID: "Вид цены недействителен",
    CONTRACT_SETTLEMENT_CURRENCY_MISSING: "Договорная валюта не указана",
  } as Record<string, string>)[candidate.qualificationCode] ?? "Требуется проверка";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function profileStateLabel(state: AdminCompanyContractMappingProjection["commercialProfileState"]): string {
  return {
    never_verified: "Не проверен",
    aligned: "Соответствует 1С",
    mismatch: "Вид цены не совпадает",
    contract_missing: "Договор не сопоставлен",
    contract_invalid: "Договор требует проверки",
    price_type_unknown: "Вид цены не распознан",
    price_data_stale: "Цены требуют обновления",
  }[state];
}

function readinessClassLabel(value: AdminCompanyContractMappingProjection["readiness"]["class"]): string {
  return {
    READY: "готов",
    REPAIRABLE_STALE_PROFILE: "ожидает автоматического восстановления",
    MISSING_CANONICAL_CONTRACT: "в 1С отсутствует основной договор",
    UNKNOWN_PRICE_TYPE: "в 1С не определён вид цены",
    UNVERIFIED_PROFILE: "профиль не подтверждён",
    NO_PAYMENT_PATH: "нет доступного способа оплаты",
    DIRECTORY_CONFLICT: "конфликт данных 1С",
  }[value];
}

function severityLabel(value: AdminCompanyContractMappingProjection["readiness"]["severity"]): string {
  return ({ high: "высокий", medium: "средний", low: "низкий", none: "нет" })[value];
}

function commercialConsequenceLabel(
  value: AdminCompanyContractMappingProjection["readiness"]["class"],
): string {
  return value === "READY"
    ? "Оформление заказа доступно."
    : "Партнёр не сможет надёжно оформить заказ до восстановления коммерческой готовности.";
}

function requiredActionLabel(
  value: AdminCompanyContractMappingProjection["readiness"]["class"],
): string {
  return {
    READY: "Действие не требуется.",
    REPAIRABLE_STALE_PROFILE: "Дождаться автоматического восстановления или запустить регламентную проверку.",
    MISSING_CANONICAL_CONTRACT: "Создать и опубликовать в 1С единственный основной договор с покупателем, затем синхронизировать справочник.",
    UNKNOWN_PRICE_TYPE: "Назначить основному договору в 1С действующий вид цены и корректную валюту расчётов.",
    UNVERIFIED_PROFILE: "Запустить регламентную локальную сверку с текущим снимком справочника.",
    NO_PAYMENT_PATH: "Настроить минимум один допустимый договор оплаты через управляемый коммерческий процесс.",
    DIRECTORY_CONFLICT: "Устранить конфликт контрагента или основного договора в 1С, затем синхронизировать справочник.",
  }[value];
}
