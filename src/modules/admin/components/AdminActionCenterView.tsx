import {
  AlertTriangle,
  CircleAlert,
  Clock3,
  Info,
} from "lucide-react";
import Link from "next/link";

import type {
  AdminActionCenter,
  AdminActionLevel,
} from "../types";

const LEVELS = {
  CRITICAL: {
    label: "Критично",
    className: "border-red-200 bg-red-50 text-red-800",
    icon: AlertTriangle,
  },
  ACTION_REQUIRED: {
    label: "Требует действия",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    icon: CircleAlert,
  },
  WAITING: {
    label: "Ожидание",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    icon: Clock3,
  },
  INFO: {
    label: "Информация",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
    icon: Info,
  },
} satisfies Record<
  AdminActionLevel,
  { label: string; className: string; icon: typeof AlertTriangle }
>;

export function AdminActionCenterView({
  center,
}: {
  center: AdminActionCenter;
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Операционный центр
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Рабочий стол</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Задачи и ситуации, которые требуют решения или контроля.
        </p>
      </header>

      <section
        aria-labelledby="admin-action-center-title"
        className="overflow-hidden border border-zinc-200 bg-white"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-semibold" id="admin-action-center-title">
              Требует внимания
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Сначала показаны блокирующие ситуации и решения менеджера.
            </p>
          </div>
          {center.items.length ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
                К действию: {center.actionableCount}
              </span>
              {center.waitingCount ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">
                  В ожидании: {center.waitingCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {center.sourceWarnings.length ? (
          <div
            className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5"
            role="status"
          >
            Часть данных временно недоступна: {center.sourceWarnings.map(({ label }) => label).join(", ")}.
            Остальные задачи показаны без изменений.
          </div>
        ) : null}

        {center.items.length ? (
          <ol className="divide-y divide-zinc-100">
            {center.items.map((item) => {
              const level = LEVELS[item.level];
              const Icon = level.icon;
              return (
                <li
                  className={item.level === "WAITING" || item.level === "INFO" ? "bg-zinc-50/50" : undefined}
                  key={item.id}
                >
                  <article className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${level.className}`}>
                          <Icon aria-hidden className="h-3.5 w-3.5" />
                          {level.label}
                        </span>
                        {item.entityLabel ? (
                          <span className="truncate text-xs font-medium text-zinc-500">
                            {item.entityLabel}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 font-semibold text-zinc-950">{item.title}</h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
                        {item.explanation}
                      </p>
                      <p className="mt-2 text-xs font-medium text-zinc-500">
                        Ожидает: {formatAge(item.createdAt, center.generatedAt)}
                      </p>
                    </div>
                    <Link
                      className="inline-flex min-h-11 w-full items-center justify-center bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
                      href={item.actionHref}
                      prefetch={false}
                    >
                      {item.actionLabel}
                    </Link>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Info aria-hidden className="h-5 w-5" />
            </span>
            <p className="mt-3 font-medium text-zinc-800">
              Нет задач, требующих вашего внимания.
            </p>
          </div>
        )}

        {center.hasMore ? (
          <p className="border-t border-zinc-200 bg-zinc-50 px-5 py-3 text-xs text-zinc-600">
            Показаны первые 24 задачи. Полные очереди доступны по ссылкам соответствующих разделов.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function formatAge(createdAt: string, generatedAt: string): string {
  const ageMs = Math.max(0, Date.parse(generatedAt) - Date.parse(createdAt));
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 1) return "менее часа";
  if (hours < 24) return `${hours} ${plural(hours, "час", "часа", "часов")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "день", "дня", "дней")}`;
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
