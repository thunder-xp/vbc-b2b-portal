import Link from "next/link";
import { OfferFeedEvidence } from "@/src/modules/commercial-campaigns/components/OfferFeedEvidence";
import { withRoutePerformance } from "@/src/lib/performance/request-diagnostics";
import { listPartnerOfferFeedAction } from "@/src/modules/commercial-campaigns/actions/partner-offer-feed.actions";
import { PartnerOfferFeedCard } from "@/src/modules/commercial-campaigns/components/PartnerOfferFeedCard";
import type { OfferFeedMechanicFilter, OfferFeedSort } from "@/src/modules/commercial-campaigns/offer-feed";
import type { CampaignFilter } from "@/src/modules/commercial-campaigns/types";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
type Params = {
  filter?: string;
  page?: string;
  mechanic?: string;
  q?: string;
  category?: string;
  brand?: string;
  sort?: string;
};
export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return withRoutePerformance("special_offers", () =>
    renderOffers(searchParams),
  );
}
async function renderOffers(searchParams: Promise<Params>) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const ro = locale === "ro",
    copy = secondaryCopy(locale);
  const mechanics: Array<[OfferFeedMechanicFilter, string]> = [
    ["all", ro ? "Toate" : "Все"],
    ["promo", "PROMO"],
    ["quantity", ro ? "Cantitate" : "Количество"],
    ["bundle", ro ? "Seturi" : "Комплекты"],
    ["conditional", ro ? "Cumpără X → Y" : "Купи X → Y"],
    ["spend", ro ? "Prag de achiziție" : "Порог закупки"],
  ];
  const filters: Array<[CampaignFilter, string]> = [
    ["active", copy.filterActive],
    ["ending", copy.filterEnding],
    ["stock", copy.filterStock],
    ["arrivals", copy.filterArrivals],
    ["purchased", copy.filterPurchased],
  ];
  const mechanic = mechanics.find(([v]) => v === params.mechanic)?.[0] ?? "all",
    filter = filters.find(([v]) => v === params.filter)?.[0] ?? "active";
  const uuid = (v?: string) =>
    v &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
      ? v
      : undefined;
  const page = Math.max(
      1,
      Math.min(5001, Math.trunc(Number(params.page) || 1)),
    ),
    q = params.q?.trim().slice(0, 100) ?? "",
    sort: OfferFeedSort = params.sort === "ending" || params.sort === "saving" || params.sort === "markup" ? params.sort : "recommended",
    category = uuid(params.category),
    brand = uuid(params.brand);
  const result = await listPartnerOfferFeedAction({
    mechanic,
    filter,
    page,
    search: q,
    categoryId: category,
    brandId: brand,
    sort,
    pageSize: 20,
  });
  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams({
      filter,
      mechanic,
      q,
      sort,
      ...(category ? { category } : {}),
      ...(brand ? { brand } : {}),
      ...patch,
    });
    return `/cabinet/offers?${next}`;
  };
  const control =
    "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-xs";
  return (
    <OfferFeedEvidence
      scope={href({ page: String(page) })}
      count={result.success ? result.data.items.length : 0}
      page={page}
      filterUsed={Boolean(
        q || category || brand || mechanic !== "all" || filter !== "active",
      )}
      sortUsed={params.sort !== undefined}
      sortMode={sort}
    >
      <nav
        aria-label={ro ? "Tipul ofertei" : "Тип предложения"}
        className="flex max-w-full gap-2 overflow-x-auto pb-1"
        data-partner-tabs
      >
        {mechanics.map(([value, label]) => (
          <Link
            key={value}
            prefetch={false}
            href={href({ mechanic: value, page: "1" })}
            aria-current={mechanic === value ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-md border px-3 text-xs ${mechanic === value ? "border-emerald-700 bg-emerald-50 font-semibold text-emerald-800" : "border-zinc-300 font-medium"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form
        action="/cabinet/offers"
        method="get"
        className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
        aria-label={copy.offersFilters}
      >
        <input type="hidden" name="mechanic" value={mechanic} />
        <input
          className={control}
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder={ro ? "SKU, produs, campanie" : "SKU, товар, кампания"}
          aria-label={ro ? "Caută oferte" : "Поиск предложений"}
        />
        <select
          className={control}
          name="filter"
          defaultValue={filter}
          aria-label={ro ? "Disponibilitate" : "Доступность"}
        >
          {filters.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className={control}
          name="category"
          defaultValue={category ?? ""}
          aria-label={ro ? "Categorie" : "Категория"}
        >
          <option value="">{ro ? "Toate categoriile" : "Все категории"}</option>
          {result.success
            ? result.data.categories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))
            : null}
        </select>
        <select
          className={control}
          name="brand"
          defaultValue={brand ?? ""}
          aria-label={ro ? "Marcă" : "Бренд"}
        >
          <option value="">{ro ? "Toate mărcile" : "Все бренды"}</option>
          {result.success
            ? result.data.brands.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))
            : null}
        </select>
        <select
          className={control}
          name="sort"
          defaultValue={sort}
          aria-label={ro ? "Sortare" : "Сортировка"}
        >
          <option value="recommended">
            {ro ? "Recomandate" : "Рекомендуемые"}
          </option>
          <option value="ending">
            {ro ? "Se încheie curând" : "Скоро заканчиваются"}
          </option>
          <option value="saving">{ro ? "Economisire maximă, %" : "Максимальная экономия, %"}</option>
          <option value="markup">{ro ? "Cel mai bun adaos" : "Лучшая наценка"}</option>
        </select>
        <button type="submit" className={`${control} font-semibold`}>
          {ro ? "Aplică" : "Применить"}
        </button>
      </form>
      {!result.success ? (
        <section
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 p-4"
        >
          {ro ? "Ofertele nu au putut fi încărcate." : result.message}
        </section>
      ) : (
        <>
          <p className="text-xs text-zinc-600 tabular-nums">
            {ro ? "Oferte" : "Предложения"}: {result.data.totalCount}
          </p>
          {result.data.items.length ? (
            <div
              className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
              data-offer-feed
            >
              {result.data.items.map((offer, index) => (
                <PartnerOfferFeedCard
                  priority={index === 0}
                  rankPosition={(page - 1) * 20 + index + 1}
                  key={offer.offerId}
                  offer={offer}
                  locale={locale}
                />
              ))}
            </div>
          ) : (
            <section className="py-4" data-compact-empty>
              <h2 className="font-semibold">{copy.offersEmpty}</h2>
            </section>
          )}
          {result.data.totalPages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
              aria-label={ro ? "Paginare" : "Страницы"}
            >
              {page > 1 ? (
                <Link
                  className={`${control} inline-flex items-center`}
                  href={href({ page: String(page - 1) })}
                >
                  {copy.back}
                </Link>
              ) : (
                <span />
              )}
              <span>
                {copy.page} {page} {copy.of} {result.data.totalPages}
              </span>
              {page < result.data.totalPages ? (
                <Link
                  className={`${control} inline-flex items-center`}
                  href={href({ page: String(page + 1) })}
                >
                  {copy.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </OfferFeedEvidence>
  );
}
