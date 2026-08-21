"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { dismissNotificationAction, markAllNotificationsReadAction, markNotificationReadAction } from "../actions/notification.actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { notificationCopy, usePartnerLocale } from "../../partner-locale";
import { notifyAllNotificationsRead } from "./notification-client-events";

export function NotificationActions({ notificationId, read, dismissible }: { notificationId: string; read: boolean; dismissible: boolean }) {
  const copy = notificationCopy(usePartnerLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ success: boolean }>, eventName: "notification_marked_read" | "notification_dismissed") => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(copy.updateError);
        return;
      }
      recordBehaviorInteraction({ eventName, route: "/cabinet/notifications", sourceSurface: "notification_page" });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!read && (
        <button className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50" disabled={pending} onClick={() => run(() => markNotificationReadAction(notificationId), "notification_marked_read")} type="button">
          <Check aria-hidden="true" size={16} />{copy.markAsRead}
        </button>
      )}
      {dismissible && (
        <button className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50" disabled={pending} onClick={() => run(() => dismissNotificationAction(notificationId), "notification_dismissed")} type="button">
          <X aria-hidden="true" size={16} />{copy.hide}
        </button>
      )}
      {error && <p aria-live="polite" className="w-full text-sm text-rose-700">{error}</p>}
    </div>
  );
}

export function MarkAllNotificationsReadButton({ disabled }: { disabled: boolean }) {
  const copy = notificationCopy(usePartnerLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markAllNotificationsReadAction();
            if (!result.success) {
              setError(copy.updateAllError);
              return;
            }
            notifyAllNotificationsRead(result.data);
            if (result.data.affectedCount > 0) {
              recordBehaviorInteraction({ eventName: "notifications_marked_all_read", route: "/cabinet/notifications", sourceSurface: "notification_page" });
            }
            router.refresh();
          });
        }}
        type="button"
      >
        <Check aria-hidden="true" size={16} />{pending ? copy.updating : copy.markAll}
      </button>
      {error && <p aria-live="polite" className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
