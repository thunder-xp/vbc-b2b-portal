import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components";
import {
  requireAdminPagePermission,
} from "@/src/modules/admin/services";
import { MerchandisingAdminTable } from "@/src/modules/merchandising/components";
import { createMerchandisingService } from "@/src/modules/merchandising/actions";

export default async function AdminMerchandisingPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const context = await requireAdminPagePermission("admin.catalog.view");
  const params = await searchParams;
  const pageNumber = positiveInteger(params.page);
  const result = await createMerchandisingService().listAdminProducts({
    search: params.search,
    page: pageNumber,
    pageSize: 25,
  });
  const canManage = context.permissions.includes("admin.catalog.manage");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Ручное управление приоритетами, периодами и редакционными метками без изменения данных 1С."
        eyebrow="Коммерческие данные"
        title="Витрина каталога"
      />
      <form className="flex max-w-xl gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 px-3"
          defaultValue={params.search}
          name="search"
          placeholder="SKU, модель, название, бренд или категория"
        />
        <button className="rounded-md border border-zinc-300 px-4 text-sm font-semibold">
          Найти
        </button>
      </form>
      <Link
        className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-500"
        href="/admin/commercial/merchandising/preview"
      >
        Предпросмотр опубликованной витрины
      </Link>
      <MerchandisingAdminTable canManage={canManage} page={result} />
      <nav className="flex items-center justify-between text-sm">
        {pageNumber > 1 ? (
          <Link href={pageHref(pageNumber - 1, params.search)}>Назад</Link>
        ) : <span />}
        <span>
          Страница {pageNumber} · товаров {result.totalCount}
        </span>
        {pageNumber * result.pageSize < result.totalCount ? (
          <Link href={pageHref(pageNumber + 1, params.search)}>Далее</Link>
        ) : <span />}
      </nav>
    </div>
  );
}

function positiveInteger(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number, search?: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (search?.trim()) params.set("search", search.trim());
  return `/admin/commercial/merchandising?${params}`;
}
