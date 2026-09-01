"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  buildProductDetailTabHref,
  parseCatalogReturnTarget,
  parseProductDetailTab,
  type ProductDetailTab,
} from "../services";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

export function ProductDetailNavigation({
  locale,
  showAnalyticsTab,
}: {
  locale: PartnerLocale;
  showAnalyticsTab: boolean;
}) {
  const searchParams = useSearchParams();
  const activeTab = parseProductDetailTab(searchParams.get("tab"));
  const returnTarget = parseCatalogReturnTarget(searchParams.get("returnTo") ?? undefined);
  const copy = getCatalogCopy(locale);
  const tabs: Array<{ id: ProductDetailTab; label: string }> = [
    { id: "overview", label: copy.overview },
    { id: "description", label: copy.description },
    { id: "characteristics", label: copy.characteristics },
    { id: "datasheet", label: copy.instructions },
    { id: "pricing", label: copy.pricing },
    ...(showAnalyticsTab
      ? [{ id: "analytics" as const, label: locale === "ro" ? "Analiză" : "Аналитика" }]
      : []),
    { id: "analogs", label: copy.analogs },
    { id: "related", label: copy.related },
  ];

  return (
    <nav aria-label={copy.productSections} className="overflow-x-auto border-b border-zinc-200">
      <div className="flex min-w-max gap-6">
        <Link
          className="inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-1 text-sm font-semibold text-zinc-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          href={returnTarget}
          prefetch={false}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {copy.backTab}
        </Link>
        {tabs.map((tab) => (
          <IntentPrefetchTabLink
            active={activeTab === tab.id}
            href={buildProductDetailTabHref(tab.id, returnTarget)}
            key={tab.id}
            label={tab.label}
          />
        ))}
      </div>
    </nav>
  );
}

function IntentPrefetchTabLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  const [intentPrefetch, setIntentPrefetch] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const startHoverPrefetch = () => {
    if (intentPrefetch || hoverTimer.current) return;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      setIntentPrefetch(true);
    }, 100);
  };

  const cancelHoverPrefetch = () => {
    if (!hoverTimer.current) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${active ? "border-emerald-600 text-emerald-800" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
      href={href}
      onFocus={() => setIntentPrefetch(true)}
      onMouseEnter={startHoverPrefetch}
      onMouseLeave={cancelHoverPrefetch}
      prefetch={intentPrefetch}
    >
      {label}
    </Link>
  );
}
