import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components/AdminPageHeader";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import {
  CatalogManagementService,
  CatalogManagementWorkspace,
  inspectFirebaseProductImageStorageConfiguration,
} from "@/src/modules/catalog-management";
import type { CatalogManagementFilter } from "@/src/modules/catalog-management/types";

export const dynamic = "force-dynamic";

export default async function AdminCatalogManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireAdminPagePermission("admin.catalog.view"),
    searchParams,
  ]);
  const pageNumber = positiveInteger(query.page, 1);
  const service = new CatalogManagementService();
  const data = await service.list({ filter: query.filter, search: query.q, page: pageNumber, pageSize: 25 });
  const activeFilter = normalizeFilter(query.filter);
  const firebase = inspectFirebaseProductImageStorageConfiguration();

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageHeader description="Качество карточек, изображения, публикация и редакционные метки в одном рабочем пространстве." eyebrow="Коммерческие данные" title="Управление каталогом" />
        <Link className="inline-flex h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold" href="/admin/commercial/merchandising/preview">Предпросмотр витрины</Link>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" method="get">
        {activeFilter !== "ALL" ? <input name="filter" type="hidden" value={activeFilter} /> : null}
        <input className="h-11 flex-1 rounded-md border border-zinc-300 px-3" defaultValue={query.q ?? ""} maxLength={100} name="q" placeholder="SKU, название, Ref_Key, бренд или категория" />
        <button className="h-11 rounded-md bg-zinc-900 px-5 text-sm font-semibold text-white" type="submit">Найти</button>
      </form>
      <CatalogManagementWorkspace activeFilter={activeFilter} canManage={context.permissions.includes("admin.catalog.manage")} data={data} firebaseConfigured={firebase.configured} search={query.q?.trim() ?? ""} />
      {data.totalCount > data.pageSize ? (
        <nav aria-label="Страницы каталога" className="flex items-center justify-between border-t pt-4 text-sm">
          <PageLink disabled={data.page <= 1} filter={activeFilter} label="Назад" page={data.page - 1} search={query.q} />
          <span>Страница {data.page} · товаров {data.totalCount}</span>
          <PageLink disabled={data.page * data.pageSize >= data.totalCount} filter={activeFilter} label="Далее" page={data.page + 1} search={query.q} />
        </nav>
      ) : null}
    </main>
  );
}

function PageLink({ disabled, filter, label, page, search }: { disabled: boolean; filter: CatalogManagementFilter; label: string; page: number; search?: string }) {
  const params = new URLSearchParams();
  if (filter !== "ALL") params.set("filter", filter);
  if (search?.trim()) params.set("q", search.trim());
  params.set("page", String(page));
  return disabled ? <span className="px-4 py-2 text-zinc-300">{label}</span> : <Link className="rounded-md border border-zinc-300 px-4 py-2 font-semibold" href={`/admin/catalog?${params}`}>{label}</Link>;
}

function normalizeFilter(value: string | undefined): CatalogManagementFilter {
  const filters: CatalogManagementFilter[] = ["ALL", "PUBLISHED", "HIDDEN", "MISSING_IMAGE", "MISSING_CATEGORY", "MISSING_BRAND", "MISSING_PRICE", "STOCK_UNKNOWN", "NEEDS_ATTENTION", "HIDDEN_BY_PORTAL", "INACTIVE_IN_1C"];
  const candidate = value?.toUpperCase() as CatalogManagementFilter | undefined;
  return candidate && filters.includes(candidate) ? candidate : "ALL";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
