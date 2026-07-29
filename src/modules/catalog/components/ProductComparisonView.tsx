"use client";

import { Columns3, Highlighter, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { AddToCartButton } from "../../orders/components/AddToCartButton";
import { getCatalogComparisonAction, type CatalogComparisonDto } from "../actions";
import { MerchandisingBadges } from "./MerchandisingBadges";
import { ProductSpecificationAction } from "./ProductSpecificationAction";
import { ProductThumbnail } from "./ProductThumbnail";
import {
  COMPARISON_CHANGED_EVENT,
  COMPARISON_LIMIT,
  comparisonStorageKey,
  readComparisonIds,
  writeComparisonIds,
} from "./comparison-storage";

type ProductComparisonViewProps = {
  canAddToOrder: boolean;
  canAddToSpecification: boolean;
  companyId: string;
  userId: string;
};

export function ProductComparisonView({
  canAddToOrder,
  canAddToSpecification,
  companyId,
  userId,
}: ProductComparisonViewProps) {
  const [comparison, setComparison] = useState<CatalogComparisonDto | null>(null);
  const [message, setMessage] = useState("Загрузка сравнения…");
  const [failed, setFailed] = useState(false);
  const [highlightDifferences, setHighlightDifferences] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const key = comparisonStorageKey(companyId, userId);
    const load = async () => {
      setFailed(false);
      const ids = readComparisonIds(companyId, userId);
      if (!ids.length) {
        if (active) {
          setComparison(null);
          setMessage("Список сравнения пуст");
        }
        return;
      }

      setMessage("Загрузка сравнения…");
      const result = await getCatalogComparisonAction(ids);
      if (!active) return;
      if (result.success) {
        setComparison(result.data);
        setMessage("");
      } else {
        setComparison(null);
        setFailed(true);
        setMessage(result.message);
      }
    };
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== key) return;
      if (event instanceof CustomEvent && event.detail?.key !== key) return;
      void load();
    };

    void load();
    window.addEventListener("storage", sync);
    window.addEventListener(COMPARISON_CHANGED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMPARISON_CHANGED_EVENT, sync);
    };
  }, [companyId, reloadVersion, userId]);

  if (!comparison) {
    return (
      <ComparisonState
        failed={failed}
        message={message}
        onRetry={() => setReloadVersion((current) => current + 1)}
      />
    );
  }

  const views = new Map(
    comparison.commercialViews.map((view) => [view.productId, view]),
  );
  const partnerPricingVisible = comparison.commercialViews.some(
    (view) => Boolean(view.partnerPrice),
  );
  const remove = (productId: string) => {
    writeComparisonIds(
      companyId,
      userId,
      readComparisonIds(companyId, userId).filter((id) => id !== productId),
    );
    recordBehaviorInteraction({
      eventName: "product_removed_from_compare",
      productId,
      route: "/cabinet/compare",
      sourceSurface: "comparison",
    });
  };
  const clear = () => writeComparisonIds(companyId, userId, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          Выбрано {comparison.products.length} из {COMPARISON_LIMIT}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={highlightDifferences}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:border-emerald-600"
            onClick={() => setHighlightDifferences((current) => !current)}
            type="button"
          >
            <Highlighter aria-hidden="true" className="size-4" />
            Выделить отличия
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:border-rose-500 hover:text-rose-700"
            onClick={clear}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Очистить
          </button>
        </div>
      </div>

      {comparison.products.length === 1 ? (
        <Notice>
          Добавьте ещё один товар, чтобы увидеть различия характеристик.
        </Notice>
      ) : null}
      {comparison.mixedCategories ? (
        <Notice>
          Товары относятся к разным категориям. Доступные характеристики
          сопоставлены по названию.
        </Notice>
      ) : null}
      {comparison.excludedProductCount > 0 ? (
        <Notice tone="warning">
          Некоторые товары больше недоступны и были исключены из сравнения.
        </Notice>
      ) : null}
      {comparison.warnings.includes("COMPARISON_ENRICHMENT_FAILED") ? (
        <Notice tone="warning">
          Часть коммерческих данных временно недоступна. Товары и характеристики
          остаются доступными.
        </Notice>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">Сравнение товаров</caption>
          <thead>
            <tr className="align-top">
              <th className="w-48 border-b border-r border-zinc-200 bg-zinc-50 p-3 text-zinc-500">
                Параметр
              </th>
              {comparison.products.map((product) => (
                <th
                  className="min-w-64 border-b border-r border-zinc-200 p-3 last:border-r-0"
                  key={product.id}
                >
                  <div className="flex h-full min-h-[21rem] flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <MerchandisingBadges labels={product.merchandisingLabels} />
                      <button
                        aria-label={`Удалить ${product.name} из сравнения`}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-rose-700"
                        onClick={() => remove(product.id)}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                    <Link
                      className="relative mt-2 block aspect-[4/3] overflow-hidden rounded-md bg-zinc-50"
                      href={`/cabinet/catalog/${product.slug}`}
                      prefetch={false}
                    >
                      <ProductThumbnail
                        alt={product.name}
                        sizes="256px"
                        src={product.imageUrl}
                      />
                    </Link>
                    <p className="mt-3 text-xs font-medium text-zinc-500">
                      SKU {product.sku}
                    </p>
                    <Link
                      className="mt-1 line-clamp-2 min-h-10 font-semibold text-zinc-950 hover:text-emerald-700"
                      href={`/cabinet/catalog/${product.slug}`}
                      prefetch={false}
                      title={product.name}
                    >
                      {product.name}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {product.brand?.name ?? product.category?.name ?? "Каталог"}
                    </p>
                    <div className="mt-auto space-y-2 pt-3">
                      {canAddToOrder ? <AddToCartButton productId={product.id} /> : null}
                      {canAddToSpecification ? (
                        <ProductSpecificationAction productId={product.id} />
                      ) : null}
                      <Link
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:border-emerald-600"
                        href={`/cabinet/catalog/${product.slug}`}
                        prefetch={false}
                      >
                        Открыть товар
                      </Link>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partnerPricingVisible ? (
              <ComparisonRow
                label="Ваша цена"
                values={comparison.products.map(
                  (product) =>
                    views.get(product.id)?.partnerPrice?.formattedAmount
                    ?? "Цена уточняется",
                )}
              />
            ) : null}
            <ComparisonRow
              label="Розничная цена"
              values={comparison.products.map(
                (product) =>
                  views.get(product.id)?.retailPrice?.formattedAmount
                  ?? "Цена уточняется",
              )}
            />
            <ComparisonRow
              label="Наличие"
              values={comparison.products.map(
                (product) =>
                  views.get(product.id)?.stock?.label
                  ?? "Наличие уточняется",
              )}
            />
            {comparison.matrix.map((row) => (
              <ComparisonRow
                highlighted={highlightDifferences && row.differs}
                key={row.key}
                label={row.label}
                values={row.values}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonState({
  failed,
  message,
  onRetry,
}: {
  failed: boolean;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-y border-zinc-200 py-12 text-center">
      <Columns3 aria-hidden="true" className="mx-auto size-8 text-zinc-400" />
      <h2 className="mt-3 text-lg font-semibold text-zinc-950">{message}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-600">
        {failed
          ? "Проверьте соединение и повторите попытку."
          : "Добавьте товары из каталога, чтобы сравнить цены, наличие и характеристики."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {failed ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
            onClick={onRetry}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Повторить
          </button>
        ) : null}
        <Link
          className="inline-flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-700"
          href="/cabinet/catalog"
          prefetch={false}
        >
          Открыть каталог
        </Link>
      </div>
    </div>
  );
}

function ComparisonRow({
  highlighted = false,
  label,
  values,
}: {
  highlighted?: boolean;
  label: string;
  values: string[];
}) {
  const tone = highlighted ? "bg-amber-50" : "bg-white";
  return (
    <tr className={tone}>
      <th className="border-b border-r border-zinc-200 p-3 font-medium text-zinc-600">
        {label}
      </th>
      {values.map((value, index) => (
        <td
          className="border-b border-r border-zinc-200 p-3 text-zinc-900 last:border-r-0"
          key={`${label}:${index}`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}

function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-sky-200 bg-sky-50 text-sky-900"
      }`}
    >
      {children}
    </p>
  );
}
