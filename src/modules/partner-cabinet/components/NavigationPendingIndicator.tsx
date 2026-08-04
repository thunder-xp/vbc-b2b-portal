"use client";

import { useLinkStatus } from "next/link";

export function NavigationPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`size-3 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin ${
        pending ? "visible" : "invisible"
      }`}
    />
  );
}
