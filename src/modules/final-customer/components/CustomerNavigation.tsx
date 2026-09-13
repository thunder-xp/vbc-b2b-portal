"use client";

import Link from "next/link";
import { LayoutDashboard, LockKeyhole, ReceiptText, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

import type { FinalCustomerLocale } from "../locale";
import { finalCustomerCopy } from "../copy";

const routes = [
  ["/account", "overview", LayoutDashboard],
  ["/account/orders", "orders", ReceiptText],
  ["/account/profile", "profile", UserRound],
  ["/account/security", "security", LockKeyhole],
] as const;

export function CustomerNavigation({ locale }: { locale: FinalCustomerLocale }) {
  const pathname = usePathname();
  const labels = finalCustomerCopy[locale];
  return (
    <nav aria-label={labels.cabinet} className="overflow-x-auto border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl gap-1 px-2 sm:px-4">
        {routes.map(([href, label, Icon]) => {
          const active = href === "/account" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-700 ${active ? "border-emerald-700 text-zinc-950" : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"}`}
              href={href}
              key={href}
              prefetch={false}
            >
              <Icon aria-hidden size={17} />
              {labels[label]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
