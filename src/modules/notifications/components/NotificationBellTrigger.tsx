"use client";

import { Bell } from "lucide-react";
import { forwardRef } from "react";

export const NotificationBellTrigger = forwardRef<
  HTMLButtonElement,
  {
    badgeCount: number;
    controls: string;
    headerControl?: string;
    expanded: boolean;
    label: string;
    onClick: () => void;
    testId?: string;
  }
>(function NotificationBellTrigger(
  { badgeCount, controls, expanded, headerControl, label, onClick, testId },
  ref,
) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={label}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      data-header-control={headerControl}
      data-testid={testId}
      onClick={onClick}
      ref={ref}
      type="button"
    >
      <Bell aria-hidden="true" size={19} />
      {badgeCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-5 text-white" data-partner-radius="semantic">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </button>
  );
});
