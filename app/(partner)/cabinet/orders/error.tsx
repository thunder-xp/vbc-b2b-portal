"use client";

import { RouteErrorState } from "@/src/modules/platform-ui";
import { getOrdersCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = getOrdersCopy(usePartnerLocale());
  return <RouteErrorState correlationId={error.digest} escapeHref="/cabinet/catalog" escapeLabel={copy.backCatalog} message={copy.routeErrorMessage} reset={reset} title={copy.routeErrorTitle} />;
}
