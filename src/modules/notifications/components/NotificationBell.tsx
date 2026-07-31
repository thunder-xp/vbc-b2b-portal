"use client";

import { Bell, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { markNotificationReadAction } from "../actions/notification.actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import type { NotificationSummary } from "../types";
import { NotificationSeverityLabel } from "./NotificationSeverityLabel";

export function NotificationBell({ initialSummary }: { initialSummary: NotificationSummary }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markRead = (notificationId: string) => {
    const target = summary.items.find((item) => item.id === notificationId);
    if (!target || target.readAt) return;
    const readAt = new Date().toISOString();
    setSummary((current) => ({
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map((item) => item.id === notificationId ? { ...item, readAt } : item),
    }));
    startTransition(async () => {
      const result = await markNotificationReadAction(notificationId);
      if (!result.success) {
        setSummary(initialSummary);
        return;
      }
      recordBehaviorInteraction({
        eventName: "notification_marked_read",
        route: "/cabinet/notifications",
        sourceSurface: "notification_bell",
      });
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls="partner-notification-popover"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Уведомления: непрочитанных ${summary.unreadCount}`}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        onClick={() => setOpen((value) => {
          const next = !value;
          if (next) {
            recordBehaviorInteraction({
              eventName: "notifications_opened",
              route: "/cabinet/notifications",
              sourceSurface: "notification_bell",
            });
          }
          return next;
        })}
        ref={triggerRef}
        type="button"
      >
        <Bell aria-hidden="true" size={19} />
        {summary.unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {summary.unreadCount > 99 ? "99+" : summary.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Последние уведомления"
          className="fixed inset-x-3 top-28 z-50 max-h-[min(34rem,calc(100vh-8rem))] overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[25rem]"
          id="partner-notification-popover"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Уведомления</h2>
            <span className="text-xs text-zinc-500">{summary.unreadCount} непрочитано</span>
          </div>
          {summary.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-600">
              Новых уведомлений пока нет.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {summary.items.map((item) => (
                <li className={item.readAt ? "bg-white" : "bg-emerald-50/40"} key={item.id}>
                  <article className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <NotificationSeverityLabel severity={item.severity} />
                        <h3 className="mt-1 text-sm font-semibold text-zinc-950">{item.title}</h3>
                      </div>
                      {!item.readAt && (
                        <span className="sr-only">Непрочитано</span>
                      )}
                      <time className="shrink-0 text-xs text-zinc-500" dateTime={item.occurredAt}>
                        {item.relativeTime}
                      </time>
                    </div>
                    <p className="text-sm leading-5 text-zinc-600">{item.message}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.actionUrl && item.actionLabel && (
                        <Link
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900"
                          href={item.actionUrl}
                          onClick={() => {
                            markRead(item.id);
                            setOpen(false);
                            recordBehaviorInteraction({
                              eventName: "notification_opened",
                              route: "/cabinet/notifications",
                              sourceSurface: "notification_bell",
                              metadataSafe: { eventGroup: item.eventGroup },
                            });
                            if (item.eventGroup === "products") {
                              recordBehaviorInteraction({
                                eventName: "product_notification_opened",
                                route: "/cabinet/notifications",
                                sourceSurface: "notification_bell",
                              });
                              recordBehaviorInteraction({
                                eventName: item.actionUrl === "/cabinet/cart"
                                  ? "product_notification_cart_opened"
                                  : "product_notification_product_opened",
                                route: item.actionUrl ?? "/cabinet/notifications",
                                sourceSurface: "notification_bell",
                              });
                            }
                          }}
                        >
                          {item.actionLabel}
                          <ExternalLink aria-hidden="true" size={14} />
                        </Link>
                      )}
                      {!item.readAt && (
                        <button
                          className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-950 disabled:opacity-50"
                          disabled={pending}
                          onClick={() => markRead(item.id)}
                          type="button"
                        >
                          <Check aria-hidden="true" size={15} />
                          Прочитано
                        </button>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-zinc-200 p-3">
            <Link
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
              href="/cabinet/notifications"
              onClick={() => setOpen(false)}
            >
              Все уведомления
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
