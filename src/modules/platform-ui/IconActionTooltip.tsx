"use client";

import { cloneElement, useId, type ReactElement } from "react";

export function IconActionTooltip({
  align = "center",
  children,
  label,
  wrap = false,
}: {
  align?: "center" | "end";
  children: ReactElement;
  label: string;
  wrap?: boolean;
}) {
  const id = useId();

  return (
    <span className="group/icon-action-tooltip relative inline-flex" data-icon-action-tooltip-trigger>
      {cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })}
      <span
        className={`pointer-events-none absolute bottom-full z-50 mb-2 hidden rounded bg-zinc-950 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover/icon-action-tooltip:block group-focus-within/icon-action-tooltip:block ${
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
        } ${
          wrap
            ? "w-max max-w-[min(18rem,calc(100vw-2rem))] whitespace-normal text-center"
            : "max-w-56 whitespace-nowrap"
        }`}
        data-icon-action-tooltip
        id={id}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
