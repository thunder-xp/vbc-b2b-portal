"use client";

import { useMemo, useState } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { getCatalogCopy, usePartnerLocale } from "../../partner-locale";
import type { RetailPriceHistoryDto } from "../../pricing-inventory";
const WIDTH = 720;
const HEIGHT = 260;
const PAD_X = 52;
const PAD_Y = 28;
const GRID_LINES = [0, 0.25, 0.5, 0.75, 1];

export function RetailPriceHistoryChart({
  history,
  productId,
}: {
  history: RetailPriceHistoryDto;
  productId: string;
}) {
  const locale = usePartnerLocale();
  const copy = getCatalogCopy(locale);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const geometry = useMemo(
    () => createGeometry(history.points, locale),
    [history.points, locale],
  );
  const stepGeometry = useMemo(() => createStepGeometry(geometry), [geometry]);
  const areaPath = useMemo(() => createAreaPath(stepGeometry), [stepGeometry]);

  return (
    <div className="space-y-4">
      {history.points.length ? (
        <div
          className="relative h-[280px] w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-50/50 shadow-sm"
          data-testid="price-history-chart"
        >
          <svg
            aria-label={copy.priceHistoryChart}
            className="h-full w-full"
            preserveAspectRatio="none"
            role="group"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <defs>
              <linearGradient id={`price-history-fill-${productId}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {GRID_LINES.map((position) => {
              const y = PAD_Y + position * (HEIGHT - PAD_Y * 2);
              return (
                <line
                  className="stroke-zinc-200"
                  key={position}
                  vectorEffect="non-scaling-stroke"
                  x1={PAD_X}
                  x2={WIDTH - PAD_X}
                  y1={y}
                  y2={y}
                />
              );
            })}
            <line
              className="stroke-zinc-300"
              vectorEffect="non-scaling-stroke"
              x1={PAD_X}
              x2={PAD_X}
              y1={PAD_Y}
              y2={HEIGHT - PAD_Y}
            />
            <line
              className="stroke-zinc-300"
              vectorEffect="non-scaling-stroke"
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={HEIGHT - PAD_Y}
              y2={HEIGHT - PAD_Y}
            />
            <path
              d={areaPath}
              fill={`url(#price-history-fill-${productId})`}
            />
            <polyline
              className="fill-none stroke-emerald-600 motion-reduce:transition-none"
              data-line-shape="step-after"
              points={stepGeometry
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              strokeLinejoin="round"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
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
                r={index === geometry.length - 1 ? "6" : "4.5"}
                role="button"
                strokeWidth="3"
                tabIndex={0}
                vectorEffect="non-scaling-stroke"
              >
                <title>{point.label}</title>
              </circle>
            ))}
          </svg>
          {focusedIndex !== null ? (
            <p
              aria-live="polite"
              className="absolute bottom-2 left-2 rounded bg-zinc-950 px-2 py-1 text-xs text-white"
            >
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
          {copy.showData}
        </summary>
        <div className="overflow-x-auto border-t border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-2">{copy.date}</th>
                <th className="px-4 py-2">{copy.retailPrice}</th>
                <th className="px-4 py-2">{copy.currency}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {history.points.map((point) => (
                <tr key={`${point.effectiveAt}:${point.amount}`}>
                  <td className="whitespace-nowrap px-4 py-2">
                    {formatDate(point.effectiveAt, locale)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">
                    {formatAmount(point.amount, locale)}
                  </td>
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

function createStepGeometry(points: ReturnType<typeof createGeometry>) {
  return points.flatMap((point, index) => {
    if (index === 0) return [{ x: point.x, y: point.y }];
    const previous = points[index - 1];
    return [
      { x: point.x, y: previous.y },
      { x: point.x, y: point.y },
    ];
  });
}

function createAreaPath(points: ReturnType<typeof createStepGeometry>) {
  if (!points.length) return "";
  const baseline = HEIGHT - PAD_Y;
  return [
    `M ${points[0].x} ${baseline}`,
    `L ${points[0].x} ${points[0].y}`,
    ...points.slice(1).map((point) => `L ${point.x} ${point.y}`),
    `L ${points[points.length - 1].x} ${baseline}`,
    "Z",
  ].join(" ");
}

function createGeometry(points: RetailPriceHistoryDto["points"], locale: "ru" | "ro") {
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
    x:
      PAD_X +
      (points.length === 1
        ? width / 2
        : ((timestamps[index] - firstTimestamp) / timeSpread) * width),
    y: PAD_Y + ((maximum - point.amount) / spread) * height,
    label: `${formatDate(point.effectiveAt, locale)}: ${formatAmount(point.amount, locale)} ${point.currency}`,
  }));
}

function formatDate(value: string, locale: "ru" | "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatAmount(value: number, locale: "ru" | "ro") {
  return new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
