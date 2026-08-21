"use client";

import { LoadingState } from "@/src/modules/platform-ui";
import { getOrdersCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function OrdersLoading() {
  return <div className="mx-auto max-w-6xl"><LoadingState label={getOrdersCopy(usePartnerLocale()).loading} rows={3} /></div>;
}
