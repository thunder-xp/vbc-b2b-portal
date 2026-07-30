"use client";

import Link from "next/link";

import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import type { BehaviorEventName } from "../../behavior-analytics/types";

export function DashboardTrackedLink({
  children,
  className,
  eventName,
  href,
  metadataSafe,
  sourceSurface,
}: {
  children: React.ReactNode;
  className?: string;
  eventName: BehaviorEventName;
  href: string;
  metadataSafe?: Record<string, string | number | boolean | null>;
  sourceSurface: string;
}) {
  return (
    <Link
      className={className}
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
