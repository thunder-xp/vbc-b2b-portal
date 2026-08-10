"use client";

import { cloneElement, useId, type ReactElement } from "react";

export function IconActionTooltip({ children, label }: { children: ReactElement; label: string }) {
  const id = useId();

  return (
    <span className="group relative inline-flex">
      {cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden max-w-56 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-950 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block group-focus-within:block"
        id={id}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
