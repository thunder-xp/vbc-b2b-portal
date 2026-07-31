"use client";

import { useLinkStatus } from "next/link";

const indicatorClass =
  "ml-2 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin";

export function OnboardingLinkPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      className={pending ? indicatorClass : indicatorClass + " invisible"}
      role={pending ? "status" : undefined}
      aria-label={pending ? "Открытие заявки" : undefined}
      aria-hidden={pending ? undefined : true}
    />
  );
}
