import { Search, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { NotificationBell } from "@/src/modules/notifications/components";
import type { PartnerWorkspaceShellContext } from "./PartnerLayout";
import { UserMenu } from "./UserMenu";

export function PartnerHeader({ context, onMenuClick }: { context: PartnerWorkspaceShellContext; onMenuClick?: () => void }) {
  const cartAvailable = context.navigation.some(
    (item) => item.key === "cart" && item.availability === "available" && item.href,
  );

  return (
    <header className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(18rem,36rem)_auto] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden" onClick={onMenuClick} type="button">
          <span className="sr-only">Открыть навигацию</span>
          <span className="h-0.5 w-4 bg-current shadow-[0_6px_0_current,0_-6px_0_current]" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase text-zinc-500">Рабочее пространство</p>
          <p className="truncate text-sm font-semibold text-zinc-950">{context.companyName ?? "Доступ к компании не настроен"}</p>
        </div>
      </div>
      <form action="/cabinet/search" className="order-3 col-span-2 flex min-w-0 lg:order-none lg:col-span-1" role="search">
        <label className="sr-only" htmlFor="partner-global-search">Поиск по рабочему пространству</label>
        <div className="relative w-full">
          <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-zinc-400" />
          <input className="h-10 w-full rounded-md border border-zinc-300 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100" id="partner-global-search" name="q" placeholder="Товары, списки, сметы..." type="search" />
        </div>
      </form>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <NotificationBell initialSummary={context.notificationSummary} />
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
