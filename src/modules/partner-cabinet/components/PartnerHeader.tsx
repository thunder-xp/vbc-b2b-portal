import { Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { NotificationBell } from "@/src/modules/notifications/components/NotificationBell";
import type { PartnerWorkspaceShellContext } from "./PartnerLayout";
import { UserMenu } from "./UserMenu";
import { QuickActionsMenu } from "./QuickActionsMenu";

export function PartnerHeader({ context, mobileNavigation }: { context: PartnerWorkspaceShellContext; mobileNavigation?: ReactNode }) {
  const cartAvailable = context.navigation.some(
    (item) => item.key === "cart" && item.availability === "available" && item.href,
  );

  return (
    <header className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(18rem,36rem)_auto] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">{mobileNavigation}</div>
      <form action="/cabinet/search" className="order-3 col-span-2 flex min-w-0 lg:order-none lg:col-span-1" role="search">
        <label className="sr-only" htmlFor="partner-global-search">Поиск по рабочему пространству</label>
        <div className="relative w-full">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-zinc-400" />
          <input className="h-11 w-full rounded-md border border-zinc-300 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100" id="partner-global-search" name="q" placeholder="Товары, документы, списки..." type="search" />
        </div>
      </form>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <QuickActionsMenu actions={context.quickActions} />
        <NotificationBell
          initialSummary={context.notificationSummary}
          key={`${context.notificationSummary.unreadCount}:${context.notificationSummary.items[0]?.id ?? "empty"}:${context.notificationSummary.items[0]?.readAt ?? "unread"}`}
        />
        {cartAvailable ? (
          <Link aria-label={`Корзина: ${context.cartItemCount} позиций`} className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href="/cabinet/cart" prefetch={false}>
            <ShoppingCart aria-hidden="true" className="size-[19px]" />
            {context.cartItemCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-700 px-1 text-center text-[11px] font-semibold leading-5 text-white">{context.cartItemCount > 99 ? "99+" : context.cartItemCount}</span> : null}
          </Link>
        ) : null}
        <UserMenu context={context} />
      </div>
    </header>
  );
}
