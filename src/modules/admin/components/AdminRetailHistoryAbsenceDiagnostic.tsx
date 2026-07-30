import Link from "next/link";
import { Search } from "lucide-react";

import { ProductThumbnail } from "@/src/modules/catalog/components";

import type {
  AdminRetailHistoryAbsenceFilters,
  AdminRetailHistoryAbsencePage,
  RetailHistoryAbsenceReason,
} from "../types";

const REASON_LABELS: Record<RetailHistoryAbsenceReason, string> = {
  no_retail_register_record: "Нет записи RETAIL в регистре",
  baseline_only_new_product: "Новый товар: только базовая цена",
  current_price_without_historical_source: "Есть текущая цена без источника истории",
  source_record_not_currently_authoritative: "Запись источника не авторитетна",
  unknown_requires_review: "Требуется проверка",
};

export function AdminRetailHistoryAbsenceDiagnostic({
  filters,
  result,
}: {
  filters: AdminRetailHistoryAbsenceFilters;
  result: AdminRetailHistoryAbsencePage;
}) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section
      aria-labelledby="retail-history-absence-title"
      className="space-y-4 border border-zinc-200 bg-white p-5"
    >
      <div>
        <h2 className="text-base font-semibold text-zinc-950" id="retail-history-absence-title">
          Активные товары без истории RETAIL
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-zinc-600">
          Диагностика активного партнёрского каталога. Раздел не создаёт цены,
          не меняет сопоставления и не обращается к 1С при открытии страницы.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Активные товары" value={result.summary.activePartnerVisibleProducts} />
        <Metric label="С проверенной историей" value={result.summary.productsWithVerifiedHistory} />
        <Metric label="Только базовая история" value={result.summary.baselineOnlyProducts} />
        <Metric label="Без источника RETAIL" value={result.summary.productsWithoutRetailRegisterSource} />
        <Metric
          label="Исключено вне каталога"
          value={result.summary.unresolvedOutOfScopeHistoricalReferences}
        />
      </dl>

      <form className="grid gap-3 border-y border-zinc-200 py-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,18rem)_minmax(14rem,22rem)_auto]" method="get">
        <label className="min-w-0 text-sm font-medium text-zinc-700">
          Поиск по SKU или названию
          <input
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 font-normal"
            defaultValue={filters.search}
            maxLength={100}
            name="q"
            placeholder="SKU или название"
            type="search"
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-zinc-700">
          Категория
          <select
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 font-normal"
            defaultValue={filters.categoryId ?? ""}
            name="category"
          >
            <option value="">Все категории</option>
            {result.categories.filter((category) => category.id).map((category) => (
              <option key={category.id} value={category.id ?? ""}>
                {category.name} ({category.count})
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium text-zinc-700">
          Причина отсутствия
          <select
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 font-normal"
            defaultValue={filters.reason ?? ""}
            name="reason"
          >
            <option value="">Все причины</option>
            {Object.entries(REASON_LABELS).map(([reason, label]) => (
              <option key={reason} value={reason}>
                {label} ({result.reasonCounts[reason as RetailHistoryAbsenceReason] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <button
          className="flex h-10 items-center justify-center gap-2 self-end rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white"
          type="submit"
        >
          <Search aria-hidden="true" className="size-4" />
          Найти
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        Найдено: <strong className="text-zinc-950">{result.total}</strong>
      </p>

      {result.records.length ? (
        <div className="overflow-x-auto border border-zinc-200">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-3">Товар</th>
                <th className="px-3 py-3">Категория / бренд</th>
                <th className="px-3 py-3">Текущая RETAIL</th>
                <th className="px-3 py-3">История</th>
                <th className="px-3 py-3">Первая публикация</th>
                <th className="px-3 py-3">Ссылка 1С</th>
                <th className="px-3 py-3">Причина</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {result.records.map((record) => (
                <tr className="align-top" key={record.id}>
                  <td className="px-3 py-3">
                    <div className="flex min-w-72 gap-3">
                      <div className="relative size-16 shrink-0 overflow-hidden border border-zinc-200 bg-zinc-50">
                        <ProductThumbnail
                          alt=""
                          className="object-contain p-1"
                          fallbackClassName="object-contain p-3"
                          sizes="64px"
                          src={record.imageUrl}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-zinc-500">{record.sku}</p>
                        <p className="mt-1 font-medium text-zinc-950">{record.name}</p>
                        <p className="mt-1 text-xs text-emerald-700">Активен и видим</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p>{record.categoryName ?? "Без категории"}</p>
                    <p className="mt-1 text-xs text-zinc-500">{record.brandName ?? "Бренд не указан"}</p>
                  </td>
                  <td className="px-3 py-3">
                    {record.currentRetailPrice === null ? (
                      <span className="text-zinc-500">Нет опубликованной цены</span>
                    ) : (
                      <>
                        <p className="font-semibold text-zinc-950">
                          {formatMoney(record.currentRetailPrice, record.currentRetailCurrency)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(record.currentRetailEffectiveAt)}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {record.baselineHistoryState === "present"
                      ? "Базовая запись есть"
                      : "Базовой записи нет"}
                  </td>
                  <td className="px-3 py-3">{formatDate(record.firstPortalPublishedAt)}</td>
                  <td className="max-w-48 break-all px-3 py-3 font-mono text-xs text-zinc-600">
                    {record.external1cRef}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex max-w-64 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      {REASON_LABELS[record.absenceReason]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
          По выбранным условиям товары не найдены.
        </div>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Страницы диагностического списка" className="flex items-center justify-between gap-3">
          <PageLink
            disabled={result.page <= 1}
            filters={filters}
            label="Назад"
            page={result.page - 1}
          />
          <span className="text-sm text-zinc-600">
            Страница {result.page} из {totalPages}
          </span>
          <PageLink
            disabled={result.page >= totalPages}
            filters={filters}
            label="Далее"
            page={result.page + 1}
          />
        </nav>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 bg-zinc-50 p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function PageLink({
  disabled,
  filters,
  label,
  page,
}: {
  disabled: boolean;
  filters: AdminRetailHistoryAbsenceFilters;
  label: string;
  page: number;
}) {
  const className = "rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium";
  if (disabled) return <span aria-disabled="true" className={`${className} text-zinc-400`}>{label}</span>;
  return <Link className={`${className} text-zinc-800`} href={pageHref(filters, page)}>{label}</Link>;
}

function pageHref(filters: AdminRetailHistoryAbsenceFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.search) query.set("q", filters.search);
  if (filters.categoryId) query.set("category", filters.categoryId);
  if (filters.reason) query.set("reason", filters.reason);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/admin/commercial/prices?${suffix}` : "/admin/commercial/prices";
}

function formatDate(value: string | null) {
  if (!value) return "Не указана";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date)
    : "Не указана";
}

function formatMoney(amount: number, currency: string | null) {
  if (!currency) return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
