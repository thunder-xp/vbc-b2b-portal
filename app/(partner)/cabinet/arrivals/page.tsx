import { PackagePlus } from "lucide-react";
import Link from "next/link";

import { listCatalogBrandsAction } from "@/src/modules/catalog/actions/list-brands.action";
import { listCatalogCategoriesAction } from "@/src/modules/catalog/actions/list-categories.action";
import { NumberedPagination } from "@/src/modules/platform-ui";
import { listWarehouseArrivalsAction } from "@/src/modules/warehouse-arrivals";

type Params = Record<string, string | string[] | undefined>;

export default async function WarehouseArrivalsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const page = positiveInt(single(params.page), 1);
  const availability: "all" | "in_stock" | "out_of_stock" = ["in_stock", "out_of_stock"].includes(single(params.availability)) ? single(params.availability) as "in_stock" | "out_of_stock" : "all";
  const input = {
    page,
    pageSize: 20,
    from: date(single(params.from)),
    to: date(single(params.to)),
    brandId: uuid(single(params.brand)),
    categoryId: uuid(single(params.category)),
    availability,
    unseenOnly: single(params.unseen) === "1",
  };
  const [result, brands, categories] = await Promise.all([
    listWarehouseArrivalsAction(input),
    listCatalogBrandsAction(),
    listCatalogCategoriesAction(),
  ]);

  return <div className="space-y-6">
    <header className="border-b border-zinc-200 pb-5">
      <p className="text-xs font-semibold uppercase text-sky-700">Каталог поступлений</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-950 sm:text-3xl">Пополнения склада</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-600">Недавно поступившие товары с актуальными ценами и текущим наличием.</p>
    </header>
    <form className="grid gap-3 border border-zinc-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
      <label className="text-sm font-medium">С даты<input className="mt-1 h-11 w-full border border-zinc-300 px-3" defaultValue={input.from} name="from" type="date" /></label>
      <label className="text-sm font-medium">По дату<input className="mt-1 h-11 w-full border border-zinc-300 px-3" defaultValue={input.to} name="to" type="date" /></label>
      <label className="text-sm font-medium">Бренд<select className="mt-1 h-11 w-full border border-zinc-300 px-3" defaultValue={input.brandId} name="brand"><option value="">Все бренды</option>{brands.success ? brands.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : null}</select></label>
      <label className="text-sm font-medium">Категория<select className="mt-1 h-11 w-full border border-zinc-300 px-3" defaultValue={input.categoryId} name="category"><option value="">Все категории</option>{categories.success ? categories.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : null}</select></label>
      <label className="text-sm font-medium">Наличие<select className="mt-1 h-11 w-full border border-zinc-300 px-3" defaultValue={input.availability} name="availability"><option value="all">Все</option><option value="in_stock">В наличии</option><option value="out_of_stock">Нет в наличии</option></select></label>
      <div className="flex items-end gap-2"><button className="min-h-11 flex-1 bg-zinc-950 px-4 text-sm font-semibold text-white" type="submit">Показать</button><Link className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-zinc-600" href="/cabinet/arrivals">Сбросить</Link></div>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input defaultChecked={input.unseenOnly} name="unseen" type="checkbox" value="1" />Только непросмотренные</label>
    </form>
    {!result.success ? <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">Не удалось загрузить поступления. Обновите страницу.</div> : result.data.items.length ? <>
      <div className="grid gap-3 lg:grid-cols-2">
        {result.data.items.map((arrival) => <Link className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-4 border border-zinc-200 bg-white p-4 outline-none hover:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-600" href={`/cabinet/arrivals/${arrival.id}`} key={arrival.id} prefetch={false}>
          <span className="flex size-11 items-center justify-center rounded bg-sky-50 text-sky-700"><PackagePlus aria-hidden="true" className="size-5" /></span>
          <span className="min-w-0"><span className="block font-semibold text-zinc-950">Пополнение склада</span><span className="mt-1 block text-sm text-zinc-600">{formatDate(arrival.completedAt)} · {arrival.productCount} позиций</span><span className="mt-1 block text-xs text-zinc-500">Сейчас в наличии: {arrival.availableProductCount} позиций</span></span>
          {!arrival.seen ? <span className="size-2 rounded-full bg-sky-600" aria-label="Не просмотрено" /> : null}
        </Link>)}
      </div>
      <NumberedPagination ariaLabel="Страницы поступлений" currentPage={result.data.page} hrefForPage={(target) => href(params, target)} totalPages={result.data.totalPages} />
    </> : <section className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"><h2 className="font-semibold">Поступлений по выбранным условиям нет</h2><p className="mt-1 text-sm text-zinc-600">Измените фильтры или вернитесь позже.</p></section>}
  </div>;
}

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function positiveInt(value: string, fallback: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function date(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : undefined; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value)); }
function href(params: Params, page: number) { const query = new URLSearchParams(); for (const [key, raw] of Object.entries(params)) { const value = single(raw); if (value && key !== "page") query.set(key, value); } if (page > 1) query.set("page", String(page)); const value = query.toString(); return value ? `/cabinet/arrivals?${value}` : "/cabinet/arrivals"; }
