"use client";

import Link from "next/link";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { BehaviorEventName } from "../../behavior-analytics/types";

export function DashboardTrackedLink({
  children,
  className,
  dataActionLevel,
  eventName,
  href,
  metadataSafe,
  sourceSurface,
}: {
  children: React.ReactNode;
  className?: string;
  dataActionLevel?: "primary" | "secondary" | "text-link" | "icon";
  eventName: BehaviorEventName;
  href: string;
  metadataSafe?: Record<string, string | number | boolean | null>;
  sourceSurface: string;
}) {
  return (
    <Link
      className={className}
      data-action-level={dataActionLevel}
      href={href}
      onClick={() =>
        recordBehaviorInteraction({
          eventName,
          metadataSafe,
          route: "/cabinet",
          sourceSurface,
        })
      }
      prefetch={false}
    >
      {children}
    </Link>
  );
}
