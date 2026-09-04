import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { NotificationBell } from "@/src/modules/notifications/components/NotificationBell";
import type { PartnerWorkspaceShellContext } from "./PartnerLayout";
import { UserMenu } from "./UserMenu";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { PartnerCartLink } from "./PartnerCartLink";
import { getQuickProductCopy, PartnerLanguageSwitch, partnerText, type PartnerTranslationKey } from "../../partner-locale";

export function PartnerHeader({ context, mobileNavigation }: { context: PartnerWorkspaceShellContext; mobileNavigation?: ReactNode }) {
  const t = (key: PartnerTranslationKey) => partnerText(context.locale, key);
  const quickProductCopy = getQuickProductCopy(context.locale);
  const cartAvailable = context.navigation.some(
    (item) => item.key === "cart" && item.availability === "available" && item.href,
  );
  const quickProductAvailable = cartAvailable && context.navigation.some(
    (item) => item.key === "catalog" && item.availability === "available" && item.href,
  );

  return (
    <header className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(18rem,36rem)_auto] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">{mobileNavigation}</div>
      {quickProductAvailable ? <Link className="order-3 col-span-2 flex h-11 min-w-0 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden" href="/cabinet/quick-order" prefetch={false}><Search aria-hidden="true" className="size-4" />{quickProductCopy.entry}</Link> : null}
      <form action="/cabinet/search" className={`${quickProductAvailable ? "hidden lg:flex" : "flex"} order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1`} role="search">
        <label className="sr-only" htmlFor="partner-global-search">{t("shell.globalSearch")}</label>
        <div className="relative w-full">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-zinc-400" />
          <input className="h-11 w-full rounded-md border border-zinc-300 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100" id="partner-global-search" name="q" placeholder={t("shell.globalSearchPlaceholder")} type="search" />
        </div>
      </form>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <PartnerLanguageSwitch locale={context.locale} />
        <QuickActionsMenu actions={context.quickActions} />
        <NotificationBell
          initialSummary={context.notificationSummary}
          key={`${context.notificationSummary.unreadCount}:${context.notificationSummary.items[0]?.id ?? "empty"}:${context.notificationSummary.items[0]?.readAt ?? "unread"}`}
        />
        {cartAvailable ? (
          <PartnerCartLink cartLabel={t("shell.cart")} initialCount={context.cartItemCount} positionsLabel={t("shell.positions")} />
        ) : null}
        <UserMenu context={context} />
      </div>
    </header>
  );
}
