"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { listCatalogProductsAction } from "../actions";
import { getProductCommercialViewsAction } from "../../pricing-inventory/actions";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto } from "../services";

export function CatalogSearch({ categoryId, initialSearch }: { categoryId?: string; initialSearch?: string }) {
  const [query, setQuery] = useState(initialSearch ?? "");
  const [results, setResults] = useState<CatalogProductCardDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [commercial, setCommercial] = useState<Record<string, ProductCommercialViewDto>>({});

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized === initialSearch) { setResults([]); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const result = await listCatalogProductsAction({ categoryId, search: normalized, page: 1, pageSize: 6 });
      const products = result.success ? result.data.products : [];
      setResults(products);
      const views = products.length ? await getProductCommercialViewsAction(products.map((product) => product.id)) : null;
      setCommercial(views?.success ? Object.fromEntries(views.data.map((view) => [view.productId, view])) : {});
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [categoryId, initialSearch, query]);

  return <div className="relative flex-1">
    <form action="/cabinet/catalog" className="relative">
      {categoryId && <input name="category" type="hidden" value={categoryId} />}
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
      <input aria-label="Поиск по каталогу" autoComplete="off" className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-10 pr-24 text-sm outline-none focus:border-emerald-700" name="search" onChange={(event) => setQuery(event.target.value)} placeholder="SKU, модель, название или бренд" type="search" value={query} />
      <button className="absolute right-1 top-1 h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white" type="submit">Найти</button>
    </form>
    {(loading || results.length > 0) && <div className="absolute left-0 right-0 top-12 z-30 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
      {loading ? <p className="p-3 text-sm text-zinc-500">Поиск...</p> : results.map((product) => <Link className="flex items-center gap-3 rounded-md p-2 hover:bg-zinc-50" href={`/cabinet/catalog/${product.slug}`} key={product.id}>
        <div className="flex size-12 shrink-0 items-center justify-center rounded bg-zinc-100">{product.imageUrl ? <img alt="" className="max-h-full max-w-full object-contain" src={product.imageUrl} /> : <Search className="size-4 text-zinc-400" />}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-950">{product.name}</p><p className="text-xs text-zinc-500">{product.sku}{product.category ? ` · ${product.category.name}` : ""}</p><p className="mt-1 text-xs font-medium text-emerald-700">{commercial[product.id]?.price?.label ?? "Цена уточняется"} · {commercial[product.id]?.stock?.label ?? "Наличие уточняется"}</p></div>
      </Link>)}
    </div>}
  </div>;
}
