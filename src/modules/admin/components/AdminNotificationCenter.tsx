"use client";

import {
  AlertTriangle,
  CircleAlert,
  Clock3,
  Info,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { NotificationBellTrigger } from "@/src/modules/notifications/components/NotificationBellTrigger";

import type {
  AdminActionCenter,
  AdminActionDomain,
  AdminActionItem,
  AdminActionLevel,
} from "../types";

type NotificationScope = "all" | "attention";
type NotificationSort = "priority" | "newest" | "oldest";

const PANEL_ID = "admin-notification-center";
const ATTENTION_LEVELS = new Set<AdminActionLevel>([
  "CRITICAL",
  "ACTION_REQUIRED",
]);

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

const DOMAINS: ReadonlyArray<{
  domain: AdminActionDomain;
  label: string;
}> = [
  { domain: "onboarding", label: "Партнёры" },
  { domain: "agent", label: "Агенты" },
  { domain: "finance", label: "Финансы / Агенты" },
  { domain: "service", label: "Сервис" },
  { domain: "integration", label: "Интеграции" },
];

export function AdminNotificationCenter({
  center,
}: {
  center: AdminActionCenter;
}) {
  const pathname = usePathname() ?? "";
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const open = openPathname === pathname;
  const [scope, setScope] = useState<NotificationScope>("all");
  const [source, setSource] = useState<"all" | AdminActionDomain>("all");
  const [sort, setSort] = useState<NotificationSort>("priority");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const availableDomains = useMemo(
    () => DOMAINS.filter(({ domain }) =>
      center.items.some((item) => item.domain === domain)
    ),
    [center.items],
  );
  const items = useMemo(() => {
    const filtered = center.items.filter((item) => {
      if (scope === "attention" && !ATTENTION_LEVELS.has(item.level)) return false;
      return source === "all" || item.domain === source;
    });
    return [...filtered].sort((left, right) =>
      compareNotifications(left, right, sort)
    );
  }, [center.items, scope, sort, source]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenPathname(null);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpenPathname(null);

  return (
    <>
      <NotificationBellTrigger
        badgeCount={center.actionableCount}
        controls={PANEL_ID}
        expanded={open}
        headerControl="admin-notifications"
        label={"Центр уведомлений: требуют внимания " + center.actionableCount}
        onClick={() => setOpenPathname(open ? null : pathname)}
        ref={triggerRef}
        testId="admin-notification-trigger"
      />

      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Закрыть центр уведомлений"
            className="absolute inset-0 bg-zinc-950/25"
            onClick={close}
            type="button"
          />
          <section
            aria-label="Центр уведомлений"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:w-[34rem] sm:max-w-[calc(100vw-2rem)]"
            id={PANEL_ID}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-lg font-semibold">Центр уведомлений</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {center.actionableCount} требуют внимания · {center.items.length} всего
                </p>
              </div>
              <button
                aria-label="Закрыть центр уведомлений"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100"
                onClick={close}
                type="button"
              >
                <X aria-hidden className="size-5" />
              </button>
            </header>

            <div className="border-b border-zinc-200 px-4 py-3 sm:px-5">
              <div aria-label="Состояние уведомлений" className="grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1" role="group">
                <FilterButton active={scope === "all"} onClick={() => setScope("all")}>
                  Все
                </FilterButton>
                <FilterButton active={scope === "attention"} onClick={() => setScope("attention")}>
                  Требуют внимания
                </FilterButton>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-zinc-600">
                  Источник
                  <select
                    aria-label="Источник уведомлений"
                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                    onChange={(event) =>
                      setSource(event.target.value as "all" | AdminActionDomain)
                    }
                    value={source}
                  >
                    <option value="all">Все источники</option>
                    {availableDomains.map(({ domain, label }) => (
                      <option key={domain} value={domain}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-zinc-600">
                  Порядок
                  <select
                    aria-label="Сортировка уведомлений"
                    className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
                    onChange={(event) =>
                      setSort(event.target.value as NotificationSort)
                    }
                    value={sort}
                  >
                    <option value="priority">По приоритету</option>
                    <option value="newest">Сначала новые</option>
                    <option value="oldest">Дольше всего ждут</option>
                  </select>
                </label>
              </div>
            </div>

            {center.sourceWarnings.length ? (
              <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5" role="status">
                Часть источников временно недоступна: {center.sourceWarnings.map(({ label }) => label).join(", ")}.
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.length ? (
                <ol className="divide-y divide-zinc-100">
                  {items.map((item) => (
                    <NotificationItem
                      generatedAt={center.generatedAt}
                      item={item}
                      key={item.id}
                    />
                  ))}
                </ol>
              ) : (
                <div className="px-5 py-12 text-center">
                  <Info aria-hidden className="mx-auto size-6 text-emerald-700" />
                  <p className="mt-3 text-sm font-medium text-zinc-800">
                    По выбранным фильтрам ситуаций нет.
                  </p>
                </div>
              )}
            </div>

            {center.hasMore ? (
              <p className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 sm:px-5">
                Показаны первые 24 ситуации. Полные очереди доступны в рабочих разделах.
              </p>
            ) : null}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={"min-h-10 rounded px-2 text-sm font-semibold " +
        (active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function NotificationItem({
  generatedAt,
  item,
}: {
  generatedAt: string;
  item: AdminActionItem;
}) {
  const level = LEVELS[item.level];
  const Icon = level.icon;
  return (
    <li data-situation-key={item.situationKey}>
      <article className="space-y-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold " + level.className}>
            <Icon aria-hidden className="size-3.5" />
            {level.label}
          </span>
          <span className="text-xs font-semibold text-zinc-500">
            {domainLabel(item.domain)}
          </span>
          <span className="ml-auto text-xs text-zinc-500">
            Ожидает {formatAge(item.createdAt, generatedAt)}
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-zinc-950">{item.title}</h3>
          {item.entityLabel ? (
            <p className="mt-1 text-xs font-medium text-zinc-500">{item.entityLabel}</p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-zinc-600">{item.explanation}</p>
        </div>
        <Link
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:w-auto"
          href={item.actionHref}
          prefetch={false}
        >
          {item.actionLabel}
        </Link>
      </article>
    </li>
  );
}

function compareNotifications(
  left: AdminActionItem,
  right: AdminActionItem,
  sort: NotificationSort,
): number {
  if (sort === "newest") {
    const newest = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return newest || left.situationKey.localeCompare(right.situationKey);
  }
  if (sort === "oldest") {
    const oldest = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return oldest || left.situationKey.localeCompare(right.situationKey);
  }
  const priority = levelRank(left.level) - levelRank(right.level);
  if (priority !== 0) return priority;
  const oldest = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return oldest || left.situationKey.localeCompare(right.situationKey);
}

function levelRank(level: AdminActionLevel): number {
  return {
    CRITICAL: 0,
    ACTION_REQUIRED: 1,
    WAITING: 2,
    INFO: 3,
  }[level];
}

function domainLabel(domain: AdminActionDomain): string {
  return DOMAINS.find((item) => item.domain === domain)?.label ?? domain;
}

function formatAge(createdAt: string, generatedAt: string): string {
  const ageMs = Math.max(0, Date.parse(generatedAt) - Date.parse(createdAt));
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 1) return "менее часа";
  if (hours < 24) return hours + " " + plural(hours, "час", "часа", "часов");
  const days = Math.floor(hours / 24);
  return days + " " + plural(days, "день", "дня", "дней");
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
