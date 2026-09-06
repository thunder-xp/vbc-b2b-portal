import Link from "next/link";
import { redirect } from "next/navigation";

import { listPartnerCampaignsAction } from "@/src/modules/commercial-campaigns/actions";
import { CampaignCard } from "@/src/modules/commercial-campaigns/components";
import type { CampaignFilter } from "@/src/modules/commercial-campaigns/types";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { PageHeader, actionClassName } from "@/src/modules/platform-ui";

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = secondaryCopy(locale);
  const filters: Array<{ value: CampaignFilter; label: string }> = [
    { value: "active", label: copy.filterActive },
    { value: "ending", label: copy.filterEnding },
    { value: "stock", label: copy.filterStock },
    { value: "arrivals", label: copy.filterArrivals },
    { value: "purchased", label: copy.filterPurchased },
  ];
  const filter = filters.some((item) => item.value === params.filter)
    ? (params.filter as CampaignFilter)
    : "active";
  const page = Math.max(1, Number(params.page) || 1);
  const result = await listPartnerCampaignsAction({
    filter,
    page,
    pageSize: 20,
  });
  if (!result.success && result.message.includes("вход"))
    redirect("/auth/sign-in");
  return (
    <div className="min-w-0 space-y-3">
      <PageHeader compact title={copy.offersTitle} />
      <nav
        aria-label={copy.offersFilters}
        className="flex max-w-full gap-2 overflow-x-auto pb-1"
      >
        {filters.map((item) => (
          <Link
            aria-current={filter === item.value ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-sm font-semibold ${filter === item.value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white"}`}
            href={
              item.value === "active"
                ? "/cabinet/offers"
                : `/cabinet/offers?filter=${item.value}`
            }
            key={item.value}
            prefetch={false}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {!result.success ? (
        <section className="border border-rose-200 bg-rose-50 p-5" role="alert">
          {locale === "ro"
            ? "Ofertele nu au putut fi încărcate."
            : result.message}
        </section>
      ) : result.data.items.length ? (
        <div className="grid gap-4">
          {result.data.items.map((campaign) => (
            <CampaignCard
              campaign={campaign}
              key={campaign.id}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <section className="py-4" data-compact-empty>
          <h2 className="font-semibold">{copy.offersEmpty}</h2>
        </section>
      )}
      {result.success && result.data.totalPages > 1 ? (
        <nav className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {page > 1 ? (
            <Link className={actionClassName.secondary} href={`/cabinet/offers?filter=${filter}&page=${page - 1}`}>
              {copy.back}
            </Link>
          ) : (
            <span />
          )}
          <span>
            {copy.page} {page} {copy.of} {result.data.totalPages}
          </span>
          {page < result.data.totalPages ? (
            <Link className={actionClassName.secondary} href={`/cabinet/offers?filter=${filter}&page=${page + 1}`}>
              {copy.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
