"use client";

import { useEffect, useState, type ReactNode } from "react";

import { NOTIFICATION_DISMISSED_EVENT } from "./notification-client-events";

export function NotificationItemShell({ children, notificationId }: { children: ReactNode; notificationId: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onDismissed = (event: Event) => {
      const detail = (event as CustomEvent<{ notificationId?: string }>).detail;
      if (detail?.notificationId === notificationId) setDismissed(true);
    };
    window.addEventListener(NOTIFICATION_DISMISSED_EVENT, onDismissed);
    return () => window.removeEventListener(NOTIFICATION_DISMISSED_EVENT, onDismissed);
  }, [notificationId]);

  return dismissed ? null : <li data-notification-id={notificationId}>{children}</li>;
}
