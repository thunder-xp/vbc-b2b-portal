"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions";

export function NotificationActions({
  notificationId,
  read,
  dismissible,
}: {
  notificationId: string;
  read: boolean;
  dismissible: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ success: boolean }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError("Не удалось обновить уведомление. Попробуйте ещё раз.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!read && (
        <button
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          disabled={pending}
          onClick={() => run(() => markNotificationReadAction(notificationId))}
          type="button"
        >
          <Check aria-hidden="true" size={16} />
          Отметить прочитанным
        </button>
      )}
      {dismissible && (
        <button
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
          disabled={pending}
          onClick={() => run(() => dismissNotificationAction(notificationId))}
          type="button"
        >
          <X aria-hidden="true" size={16} />
          Скрыть
        </button>
      )}
      {error && <p aria-live="polite" className="w-full text-sm text-rose-700">{error}</p>}
    </div>
  );
}

export function MarkAllNotificationsReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      disabled={disabled || pending}
      onClick={() => startTransition(async () => {
        const result = await markAllNotificationsReadAction();
        if (result.success) router.refresh();
      })}
      type="button"
    >
      <Check aria-hidden="true" size={16} />
      {pending ? "Обновление..." : "Прочитать все"}
    </button>
  );
}

