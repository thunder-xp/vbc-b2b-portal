import Link from "next/link";
import { redirect } from "next/navigation";

import { listPartnerCampaignsAction } from "@/src/modules/commercial-campaigns/actions";
import { CampaignCard } from "@/src/modules/commercial-campaigns/components";
import type { CampaignFilter } from "@/src/modules/commercial-campaigns/types";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

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
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.offersEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">
          {copy.offersTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          {copy.offersDescription}
        </p>
      </header>
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
        <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <h2 className="font-semibold">{copy.offersEmpty}</h2>
          <p className="mt-1 text-sm text-zinc-600">{copy.offersEmptyHint}</p>
        </section>
      )}
      {result.success ? (
        <nav className="flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">
          {page > 1 ? (
            <Link href={`/cabinet/offers?filter=${filter}&page=${page - 1}`}>
              {copy.back}
            </Link>
          ) : (
            <span />
          )}
          <span>
            {copy.page} {page} {copy.of} {result.data.totalPages}
          </span>
          {page < result.data.totalPages ? (
            <Link href={`/cabinet/offers?filter=${filter}&page=${page + 1}`}>
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
