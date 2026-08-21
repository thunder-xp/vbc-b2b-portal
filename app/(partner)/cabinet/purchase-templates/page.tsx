import { Archive, Copy, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listPurchaseTemplatesAction } from "@/src/modules/purchase-templates/actions";
import {
  formatPartnerDate,
  procurementCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

type SearchParams = Promise<{
  search?: string | string[];
  filter?: string | string[];
  page?: string | string[];
}>;

export default async function PurchaseTemplatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = procurementCopy(locale);
  const search = single(params.search);
  const filter = normalizeFilter(single(params.filter));
  const page = Math.max(1, Number(single(params.page)) || 1);
  const result = await listPurchaseTemplatesAction({ search, filter, page });
  if (!result.success && result.errorCode === "AUTH_REQUIRED")
    redirect("/auth/sign-in");
  if (!result.success)
    return (
      <p className="border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {copy.templatesLoadError}
      </p>
    );
  return (
    <div className="space-y-6">
      <BehaviorViewEvent
        dedupeKey={`purchase-templates:${filter}:${page}:${search}`}
        eventName="purchase_templates_opened"
        resultCount={result.data.totalCount}
        route="/cabinet/purchase-templates"
        searchQuery={search || undefined}
        sourceSurface="purchase_template_list"
      />
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.repeatPurchases}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
            {copy.templates}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            {copy.templatesHint}
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
          href="/cabinet/purchase-templates/new"
          prefetch={false}
        >
          <Plus className="size-4" />
          {copy.newTemplate}
        </Link>
      </header>
      <form className="flex flex-wrap gap-2" method="get">
        <input
          className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 sm:max-w-md"
          defaultValue={search}
          name="search"
          placeholder={copy.templateSearch}
        />
        <select
          className="h-11 rounded-md border border-zinc-300 px-3"
          defaultValue={filter}
          name="filter"
        >
          <option value="all">{copy.allActive}</option>
          <option value="mine">{copy.mineShort}</option>
          <option value="company">{copy.company}</option>
          <option value="active">{copy.active}</option>
          <option value="archived">{copy.archive}</option>
        </select>
        <button
          className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold"
          type="submit"
        >
          {copy.show}
        </button>
      </form>
      {!result.data.records.length ? (
        <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <h2 className="font-semibold">{copy.templatesNotFound}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {copy.templatesNotFoundHint}
          </p>
        </section>
      ) : (
        <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
          {result.data.records.map((template) => (
            <li
              className="min-w-0 border border-zinc-200 bg-white p-4"
              key={template.id}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    {template.visibility === "private"
                      ? copy.private
                      : copy.company}
                    {template.status === "archived" ? ` · ${copy.archive}` : ""}
                  </p>
                  <Link
                    className="mt-1 block truncate text-lg font-semibold text-zinc-950 hover:text-emerald-700"
                    href={`/cabinet/purchase-templates/${template.id}`}
                    prefetch={false}
                  >
                    {template.name}
                  </Link>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {copy.owner}: {template.ownerName}
                  </p>
                </div>
                {template.warningCount ? (
                  <span className="shrink-0 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    {copy.warningCount}: {template.warningCount}
                  </span>
                ) : null}
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric
                  label={copy.positions}
                  value={String(template.itemCount)}
                />
                <Metric label={copy.uses} value={String(template.usageCount)} />
                <Metric
                  label={copy.updated}
                  value={formatPartnerDate(template.updatedAt, locale)}
                />
                <Metric
                  label={copy.lastRun}
                  value={
                    template.lastUsedAt
                      ? formatPartnerDate(template.lastUsedAt, locale)
                      : copy.neverRun
                  }
                />
              </dl>
              {template.totals.length ? (
                <p className="mt-3 text-sm font-semibold">
                  {copy.currentTotal}:{" "}
                  {template.totals.map((total) => total.formatted).join(" · ")}
                </p>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">
                  {copy.currentTotalUnavailable}
                </p>
              )}
              <div className="mt-4 flex min-w-0 flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold"
                  href={`/cabinet/purchase-templates/${template.id}`}
                  prefetch={false}
                >
                  {copy.open}
                </Link>
                {template.status === "active" ? (
                  <Link
                    className="inline-flex min-h-11 max-w-full items-center gap-2 whitespace-normal rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white"
                    href={`/cabinet/purchase-templates/${template.id}`}
                    prefetch={false}
                  >
                    <ShoppingCart className="size-4 shrink-0" />
                    {copy.checkAndAdd}
                  </Link>
                ) : null}
                {template.canEdit ? (
                  <span className="sr-only">
                    <Copy />
                    {copy.createCopy}
                    <Archive />
                    {copy.archiveAction}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <nav className="flex items-center justify-between border-t border-zinc-200 pt-4">
        {result.data.page > 1 ? (
          <Link
            className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm"
            href={href(search, filter, result.data.page - 1)}
            prefetch={false}
          >
            {copy.back}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-sm text-zinc-500">
          {copy.page} {result.data.page} {copy.of} {result.data.totalPages}
        </span>
        {result.data.page < result.data.totalPages ? (
          <Link
            className="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm"
            href={href(search, filter, result.data.page + 1)}
            prefetch={false}
          >
            {copy.next}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-900">{value}</dd>
    </div>
  );
}
function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function normalizeFilter(
  value: string,
): "all" | "mine" | "company" | "active" | "archived" {
  return ["mine", "company", "active", "archived"].includes(value)
    ? (value as never)
    : "all";
}
function href(search: string, filter: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  return `/cabinet/purchase-templates?${params}`;
}
