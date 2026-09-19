"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type CabinetNavigationItem = Readonly<{
  href: string;
  label: string;
  Icon: LucideIcon;
  activePrefixes?: readonly string[];
}>;

export function CabinetNavigation({
  ariaLabel,
  items,
  maxWidthClass = "max-w-6xl",
}: {
  ariaLabel: string;
  items: readonly CabinetNavigationItem[];
  maxWidthClass?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="border-b border-zinc-200 bg-white">
      <div className={`mx-auto grid grid-cols-5 ${maxWidthClass} md:flex md:gap-1 md:px-4`}>
        {items.map(({ href, label, Icon, activePrefixes = [] }) => {
          const active = href === pathname || activePrefixes.some((prefix) => pathname.startsWith(prefix));
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 min-w-0 items-center justify-center gap-1 border-b-2 px-1 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none md:min-h-11 md:shrink-0 md:flex-row md:gap-2 md:px-3 md:py-0 md:text-sm ${active ? "border-emerald-700 bg-emerald-50/60 text-emerald-950" : "border-transparent text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"}`}
              href={href}
              key={href}
              prefetch={false}
            >
              <Icon aria-hidden className="size-[18px] shrink-0" />
              <span className="min-w-0 break-words md:whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
