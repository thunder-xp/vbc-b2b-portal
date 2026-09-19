"use client";

import { Headphones, Home, ReceiptText, ShoppingBag, UserRound } from "lucide-react";

import { CabinetNavigation } from "@/src/modules/cabinet-experience/components";
import type { FinalCustomerLocale } from "../locale";
import { finalCustomerCopy } from "../copy";

export function CustomerNavigation({ locale }: { locale: FinalCustomerLocale }) {
  const copy = finalCustomerCopy[locale];
  const items = [
    { href: "/account", label: copy.home, Icon: Home },
    { href: "/account/orders", label: copy.orders, Icon: ReceiptText, activePrefixes: ["/account/orders/"] },
    { href: "/account/purchases", label: copy.purchases, Icon: ShoppingBag, activePrefixes: ["/account/purchases/", "/account/equipment"] },
    { href: "/account/service", label: copy.service, Icon: Headphones, activePrefixes: ["/account/service/"] },
    { href: "/account/profile", label: copy.profile, Icon: UserRound, activePrefixes: ["/account/profile/", "/account/security"] },
  ] as const;
  return <CabinetNavigation ariaLabel={copy.cabinet} items={items} maxWidthClass="max-w-5xl" />;
}
