"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";

export function ProductNotificationLink({
  actionUrl,
  children,
  className,
}: {
  actionUrl: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <Link
      className={className}
      href={actionUrl}
      prefetch={false}
      onClick={() => {
        recordBehaviorInteraction({
          eventName: "product_notification_opened",
          route: "/cabinet/notifications",
          sourceSurface: "notification_page",
        });
        recordBehaviorInteraction({
          eventName: actionUrl === "/cabinet/cart"
            ? "product_notification_cart_opened"
            : "product_notification_product_opened",
          route: actionUrl,
          sourceSurface: "notification_page",
        });
      }}
    >
      {children}
    </Link>
  );
}
