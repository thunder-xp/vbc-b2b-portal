"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto, CatalogProductListResult, CatalogSort } from "../services";
import { ProductThumbnail } from "./ProductThumbnail";

type SearchResponse =
  | { success: true; data: CatalogProductListResult }
  | { success: false };

export function CatalogSearch({ categoryId, initialSearch, sort = "default" }: { categoryId?: string; initialSearch?: string; sort?: CatalogSort }) {
  const [query, setQuery] = useState(initialSearch ?? "");
  const [results, setResults] = useState<CatalogProductCardDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [commercial, setCommercial] = useState<Record<string, ProductCommercialViewDto>>({});
  const lastRequestedRef = useRef<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized === initialSearch) return;
    const requestKey = `${categoryId ?? ""}:${normalized.toLocaleLowerCase()}`;
    if (lastRequestedRef.current === requestKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      lastRequestedRef.current = requestKey;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: normalized });
        if (categoryId) params.set("category", categoryId);
        const response = await fetch(`/api/catalog/search?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json() as SearchResponse;
        if (controller.signal.aborted) return;
        const products = result.success ? result.data.products : [];
        const views = result.success ? result.data.commercialViews ?? [] : [];
        setResults(products);
        setCommercial(Object.fromEntries(views.map((view) => [view.productId, view])));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          lastRequestedRef.current = null;
          setResults([]);
          setCommercial({});
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, isLikelyExactSku(normalized) ? 100 : 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [categoryId, initialSearch, query]);

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    if (nextQuery.trim().length < 2) {
      setResults([]);
      setCommercial({});
    }
  }

  return <div className="relative flex-1">
    <form action="/cabinet/catalog" className="relative">
      {categoryId && <input name="category" type="hidden" value={categoryId} />}
      {sort !== "default" && <input name="sort" type="hidden" value={sort} />}
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
      <input aria-label="Поиск по каталогу" autoComplete="off" className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-10 pr-24 text-sm outline-none focus:border-emerald-700" name="search" onChange={(event) => updateQuery(event.target.value)} placeholder="SKU, модель, название или бренд" type="search" value={query} />
      <button className="absolute right-1 top-1 h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white" type="submit">Найти</button>
    </form>
    {(loading || results.length > 0) && <div className="absolute left-0 right-0 top-12 z-30 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
      {loading ? <p className="p-3 text-sm text-zinc-500">Поиск...</p> : results.map((product) => <Link className="flex items-center gap-3 rounded-md p-2 hover:bg-zinc-50" href={`/cabinet/catalog/${product.slug}`} key={product.id} prefetch={false}>
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-100">{product.imageUrl ? <ProductThumbnail alt="" className="object-contain p-1" sizes="48px" src={product.imageUrl} /> : <Search className="size-4 text-zinc-400" />}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-950">{product.name}</p><p className="text-xs text-zinc-500">{product.sku}{product.category ? ` · ${product.category.name}` : ""}</p><p className="mt-1 text-xs font-medium text-emerald-700">{commercial[product.id]?.partnerPrice?.formattedAmount ?? "Цена уточняется"} · {commercial[product.id]?.stock?.label ?? "Наличие уточняется"}</p></div>
      </Link>)}
    </div>}
  </div>;
}

function isLikelyExactSku(value: string): boolean {
  return /^\d{5,}$/.test(value) || /^[a-z]{2,}-\d{3,}$/i.test(value);
}
