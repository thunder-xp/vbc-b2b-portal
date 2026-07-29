"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { RetailPriceHistoryDto } from "../../pricing-inventory";
import type { RetailPriceHistoryRange } from "../../pricing-inventory/repositories";

const RANGES: Array<{ value: RetailPriceHistoryRange; label: string }> = [
  { value: "3m", label: "3 месяца" },
  { value: "6m", label: "6 месяцев" },
  { value: "12m", label: "12 месяцев" },
  { value: "all", label: "Всё время" },
];
const WIDTH = 720;
const HEIGHT = 260;
const PAD_X = 52;
const PAD_Y = 28;

export function RetailPriceHistoryChart({
  history,
  productId,
}: {
  history: RetailPriceHistoryDto;
  productId: string;
}) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const geometry = useMemo(() => createGeometry(history.points), [history.points]);

  return (
    <div className="space-y-4">
      <nav aria-label="Период истории цены" className="flex flex-wrap gap-2">
        {RANGES.map((range) => (
          <Link
            aria-current={history.range === range.value ? "page" : undefined}
            className={`rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              history.range === range.value
                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
            href={`?tab=pricing&range=${range.value}`}
            key={range.value}
            onClick={() => recordBehaviorInteraction({
              eventName: "retail_price_history_range_changed",
              metadataSafe: { range: range.value },
              productId,
              route: "/cabinet/catalog/[slug]",
              sourceSurface: "product_pricing_tab",
            })}
            prefetch={false}
          >
            {range.label}
          </Link>
        ))}
      </nav>

      {history.points.length > 1 ? (
        <div className="relative h-[280px] w-full overflow-hidden rounded-md border border-zinc-200 bg-white">
          <svg
            aria-label="График истории розничной цены"
            className="h-full w-full"
            preserveAspectRatio="none"
            role="group"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <line className="stroke-zinc-200" x1={PAD_X} x2={PAD_X} y1={PAD_Y} y2={HEIGHT - PAD_Y} />
            <line className="stroke-zinc-200" x1={PAD_X} x2={WIDTH - PAD_X} y1={HEIGHT - PAD_Y} y2={HEIGHT - PAD_Y} />
            <polyline
              className="fill-none stroke-emerald-600 motion-reduce:transition-none"
              points={geometry.map((point) => `${point.x},${point.y}`).join(" ")}
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {geometry.map((point, index) => (
              <circle
                aria-label={point.label}
                className="cursor-pointer fill-white stroke-emerald-700 outline-none focus:fill-emerald-100"
                cx={point.x}
                cy={point.y}
                key={`${point.effectiveAt}:${point.amount}`}
                onBlur={() => setFocusedIndex(null)}
                onFocus={() => setFocusedIndex(index)}
                r="5"
                role="button"
                strokeWidth="3"
                tabIndex={0}
              >
                <title>{point.label}</title>
              </circle>
            ))}
          </svg>
          {focusedIndex !== null ? (
            <p aria-live="polite" className="absolute bottom-2 left-2 rounded bg-zinc-950 px-2 py-1 text-xs text-white">
              {geometry[focusedIndex]?.label}
            </p>
          ) : null}
        </div>
      ) : null}

      <details
        className="rounded-md border border-zinc-200 bg-white"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            recordBehaviorInteraction({
              eventName: "retail_price_history_data_opened",
              productId,
              route: "/cabinet/catalog/[slug]",
              sourceSurface: "product_pricing_tab",
            });
          }
        }}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-emerald-800">
          Показать данные
        </summary>
        <div className="overflow-x-auto border-t border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr><th className="px-4 py-2">Дата</th><th className="px-4 py-2">Розничная цена</th><th className="px-4 py-2">Валюта</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {history.points.map((point) => (
                <tr key={`${point.effectiveAt}:${point.amount}`}>
                  <td className="whitespace-nowrap px-4 py-2">{formatDate(point.effectiveAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{formatAmount(point.amount)}</td>
                  <td className="px-4 py-2">{point.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function createGeometry(points: RetailPriceHistoryDto["points"]) {
  const amounts = points.map((point) => point.amount);
  const timestamps = points.map((point) => Date.parse(point.effectiveAt));
  const minimum = Math.min(...amounts);
  const maximum = Math.max(...amounts);
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const spread = maximum - minimum || 1;
  const timeSpread = lastTimestamp - firstTimestamp || 1;
  const width = WIDTH - PAD_X * 2;
  const height = HEIGHT - PAD_Y * 2;
  return points.map((point, index) => ({
    ...point,
    x: PAD_X + (points.length === 1
      ? width / 2
      : (timestamps[index] - firstTimestamp) / timeSpread * width),
    y: PAD_Y + (maximum - point.amount) / spread * height,
    label: `${formatDate(point.effectiveAt)}: ${formatAmount(point.amount)} ${point.currency}`,
  }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
