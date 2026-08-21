"use client";

import { RouteErrorState } from "@/src/modules/platform-ui";
import { getCatalogCopy, usePartnerLocale } from "@/src/modules/partner-locale";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = getCatalogCopy(usePartnerLocale());
  return <RouteErrorState correlationId={error.digest} escapeHref="/cabinet/catalog?view=all" escapeLabel={copy.allCatalog} message={copy.unavailableMessage} reset={reset} title={copy.unavailableTitle} />;
}
