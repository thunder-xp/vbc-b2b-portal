"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@/src/modules/access-control/actions/action-result";
import {
  formatPartnerDate,
  usePartnerLocale,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import {
  lookupInternalWarrantySerialAction,
  lookupPartnerWarrantySerialAction,
} from "./actions";
import type {
  InternalWarrantyLookup,
  PartnerWarrantyLookup,
  WarrantySerialDiagnostics,
} from "./types";

const partnerInitial: ActionResult<PartnerWarrantyLookup | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};
const internalInitial: ActionResult<InternalWarrantyLookup | null> = {
  success: true,
  errorCode: null,
  message: "",
  data: null,
};
const inputClass =
  "min-h-11 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export function PartnerWarrantySerialLookup() {
  const locale = usePartnerLocale();
  const copy = partnerWarrantyCopy(locale);
  const [state, action, pending] = useActionState(
    lookupPartnerWarrantySerialAction,
    partnerInitial,
  );
  return (
    <section
      className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5"
      aria-labelledby="warranty-check-title"
    >
      <h2
        id="warranty-check-title"
        className="text-lg font-semibold text-zinc-950"
      >
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">{copy.hint}</p>
      <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="partner-serial">
          {copy.enterSerial}
        </label>
        <input
          id="partner-serial"
          className={inputClass}
          maxLength={120}
          name="serial"
          placeholder={copy.enterSerial}
          required
        />
        <button
          className="min-h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? copy.checking : copy.check}
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {state.data ? (
          <PartnerResult locale={locale} result={state.data} />
        ) : state.message && !state.success ? (
          <p className="text-sm text-rose-700">{copy.lookupError}</p>
        ) : null}
      </div>
    </section>
  );
}

function PartnerResult({
  result,
  locale,
}: {
  result: PartnerWarrantyLookup;
  locale: PartnerLocale;
}) {
  const copy = partnerWarrantyCopy(locale);
  const content = partnerResultCopy(result, locale);
  const canCreate = result.result !== "not_found";
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-900">{content}</p>
      {result.productName ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Detail label={copy.model} value={result.productName} />
          <Detail label="SKU" value={result.sku} />
          <Detail
            label={copy.saleDate}
            value={partnerDate(result.saleDate, locale)}
          />
          <Detail
            label={copy.warrantyPeriod}
            value={
              result.warrantyMonths
                ? `${result.warrantyMonths} ${copy.months}`
                : null
            }
          />
          <Detail
            label={copy.warrantyUntil}
            value={partnerDate(result.warrantyEndDate, locale)}
          />
          <Detail label={copy.serial} value={result.maskedSerial} />
        </dl>
      ) : null}
      {canCreate ? (
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white"
          href={`/cabinet/service/new?verification=${result.verificationId}`}
        >
          {result.result === "covered" ? copy.createService : copy.createReview}
        </Link>
      ) : null}
    </div>
  );
}

export function InternalWarrantySerialLookup() {
  const [state, action, pending] = useActionState(
    lookupInternalWarrantySerialAction,
    internalInitial,
  );
  return (
    <div className="space-y-5">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="internal-serial">
          Точный серийный номер
        </label>
        <input
          id="internal-serial"
          className={inputClass}
          maxLength={120}
          name="serial"
          placeholder="Точный серийный номер"
          required
        />
        <button
          className="min-h-11 rounded-md bg-zinc-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "Проверка..." : "Проверить"}
        </button>
      </form>
      <div aria-live="polite">
        {state.data ? (
          <InternalResult result={state.data} />
        ) : state.message && !state.success ? (
          <p className="text-sm text-rose-700">{state.message}</p>
        ) : null}
      </div>
    </div>
  );
}

function InternalResult({ result }: { result: InternalWarrantyLookup }) {
  if (result.result === "not_found")
    return (
      <p className="rounded-md border border-zinc-200 p-4 text-sm">
        Серийный номер не найден.
      </p>
    );
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 rounded-md border border-zinc-200 p-4 text-sm sm:grid-cols-3">
        <Detail label="Серийный номер" value={result.serial} />
        <Detail label="Компания" value={result.companyName} />
        <Detail label="Товар" value={result.productName} />
        <Detail label="SKU" value={result.sku} />
        <Detail label="Состояние" value={result.warrantyState} />
        <Detail label="Дата продажи" value={date(result.saleDate)} />
        <Detail label="Гарантия до" value={date(result.warrantyEndDate)} />
        <Detail
          label="Причины проверки"
          value={result.reviewReasonCodes?.join(", ")}
        />
      </dl>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Событие</th>
              <th className="p-2">Документ</th>
              <th className="p-2">Дата</th>
              <th className="p-2">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {result.timeline?.map((event, index) => (
              <tr
                className="border-b"
                key={`${event.documentNumber}-${event.eventType}-${index}`}
              >
                <td className="p-2">{event.eventType}</td>
                <td className="p-2">{event.documentNumber}</td>
                <td className="p-2">{date(event.documentDate)}</td>
                <td className="p-2">{event.mappingState}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WarrantySerialDiagnosticsView({
  data,
}: {
  data: WarrantySerialDiagnostics;
}) {
  const entries = [
    ["Всего событий", data.totalEvents],
    ["Уникальные серийные номера", data.uniqueSerials],
    ["Текущие продажи", data.currentSales],
    ["Подтверждённая гарантия", data.covered],
    ["Требуют проверки", data.reviewRequired],
    ["Истекла", data.expired],
    ["Возвращены", data.returned],
    ["Отменены", data.cancelled],
    ["Перепроданы", data.resold],
    ["Конфликты", data.conflicts],
    ["Не сопоставлена компания", data.unmappedCompanies],
    ["Не сопоставлен товар", data.unmappedProducts],
    ["Нет срока гарантии", data.missingWarrantyPeriod],
    ["Неполный источник", data.sourceIncomplete],
    ["Очередь сверки", data.reconciliationBacklog],
    ["Ошибки воркера за 30 дней", data.workerFailures],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([label, value]) => (
        <div
          className="rounded-md border border-zinc-200 bg-white p-4"
          key={label}
        >
          <dt className="text-xs text-zinc-500">{label}</dt>
          <dd className="mt-2 text-2xl font-semibold">{value}</dd>
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-zinc-900">
        {value || "Недоступно"}
      </dd>
    </div>
  );
}
function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : null;
}
function partnerDate(value: string | null | undefined, locale: PartnerLocale) {
  return value ? formatPartnerDate(value, locale) : null;
}
function partnerResultCopy(
  result: PartnerWarrantyLookup,
  locale: PartnerLocale,
) {
  const copy = partnerWarrantyCopy(locale);
  if (result.result === "covered") return copy.covered;
  if (result.result === "expired")
    return `${copy.expired}${result.warrantyEndDate ? ` ${partnerDate(result.warrantyEndDate, locale)}` : ""}.`;
  if (result.result === "returned_or_cancelled") return copy.returned;
  if (result.result === "not_found") return copy.notFound;
  if (result.result === "conflict") return copy.conflict;
  return copy.review;
}

function partnerWarrantyCopy(locale: PartnerLocale) {
  return locale === "ro"
    ? {
        title: "Verificarea achiziției și garanției",
        hint: "Verificarea folosește datele Novotech confirmate, fără solicitări către 1C din browser.",
        enterSerial: "Introduceți numărul de serie",
        checking: "Se verifică...",
        check: "Verifică",
        lookupError: "Verificarea nu a putut fi efectuată. Încercați din nou.",
        model: "Model",
        saleDate: "Data vânzării",
        warrantyPeriod: "Perioada de garanție",
        months: "luni",
        warrantyUntil: "Garanție până la",
        serial: "Număr de serie",
        createService: "Creează solicitare de service",
        createReview: "Creează solicitare de verificare a garanției",
        covered:
          "Echipamentul a fost achiziționat de la Novotech și beneficiază de service în garanție.",
        expired: "Achiziția este confirmată. Perioada de garanție s-a încheiat",
        returned:
          "Numărul de serie nu are un statut activ de garanție confirmat. Contactați centrul de service pentru verificare.",
        notFound:
          "Numărul de serie nu a fost găsit în vânzările Novotech confirmate.",
        conflict: "Numărul de serie necesită verificare manuală.",
        review:
          "Achiziția echipamentului de la Novotech este confirmată. Statutul garanției necesită verificare suplimentară.",
      }
    : {
        title: "Проверка покупки и гарантии",
        hint: "Проверка выполняется по подтверждённым данным Novotech без обращения к 1С в браузере.",
        enterSerial: "Введите серийный номер",
        checking: "Проверка...",
        check: "Проверить",
        lookupError: "Не удалось выполнить проверку. Повторите попытку.",
        model: "Модель",
        saleDate: "Дата продажи",
        warrantyPeriod: "Гарантийный срок",
        months: "мес.",
        warrantyUntil: "Гарантия до",
        serial: "Серийный номер",
        createService: "Создать сервисную заявку",
        createReview: "Создать заявку на проверку гарантии",
        covered:
          "Оборудование приобретено у Novotech и обеспечено гарантийным обслуживанием.",
        expired: "Покупка подтверждена. Гарантийный срок завершён",
        returned:
          "Серийный номер не имеет подтверждённого активного гарантийного статуса. Обратитесь в сервисный центр для проверки.",
        notFound:
          "Серийный номер не найден в подтверждённых продажах Novotech.",
        conflict: "Для серийного номера требуется ручная проверка.",
        review:
          "Покупка оборудования у Novotech подтверждена. Гарантийный статус требует дополнительной проверки.",
      };
}
