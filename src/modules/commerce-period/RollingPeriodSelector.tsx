import Link from "next/link";

import { ROLLING_PERIODS, type NewRollingPeriod } from "./rolling-period";

export function RollingPeriodSelector<TPeriod extends NewRollingPeriod>({
  activePeriod,
  hrefForPeriod,
  locale,
  periods = ROLLING_PERIODS as unknown as readonly TPeriod[],
  tone = "partner",
}: {
  activePeriod: TPeriod;
  hrefForPeriod: (period: TPeriod) => string;
  locale: "ru" | "ro";
  periods?: readonly TPeriod[];
  tone?: "partner" | "retail";
}) {
  const activeClass = tone === "retail"
    ? "border-blue-700 text-blue-800"
    : "border-emerald-700 text-emerald-800";
  const focusClass = tone === "retail"
    ? "focus-visible:ring-blue-600"
    : "focus-visible:ring-emerald-600";

  return (
    <nav
      aria-label={locale === "ro" ? "Perioada în zile" : "Период в днях"}
      className="inline-flex shrink-0 items-end gap-1"
      data-rolling-period-selector
    >
      {periods.map((period) => {
        const active = period === activePeriod;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center border-b-2 px-2 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 ${focusClass} ${active ? activeClass : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
            data-period={period}
            href={hrefForPeriod(period)}
            key={period}
            prefetch={false}
          >
            {period}
          </Link>
        );
      })}
    </nav>
  );
}
