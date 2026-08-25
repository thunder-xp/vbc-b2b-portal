"use client";

import { useState, useTransition } from "react";

import { reviewCompetitorRetailRowAction, searchAdminCompetitorProductsAction } from "../retail-pricing.actions";

type Product = { id: string; sku: string; name: string };

export function AdminCompetitorProductPicker({ importId, rowId, suggestions }: { importId: string; rowId: string; suggestions: Product[] }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState(suggestions);
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2">
    <div className="flex min-w-0 gap-2"><input aria-label="Поиск товара Novotech" className="min-h-11 min-w-0 flex-1 border border-zinc-300 px-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="SKU или название" value={query} /><button className="min-h-11 border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-50" disabled={pending || query.trim().length < 2} onClick={() => startTransition(async () => { const result = await searchAdminCompetitorProductsAction(query); if (result.success) setProducts(result.data); })} type="button">Найти</button></div>
    <form action={reviewCompetitorRetailRowAction} className="flex min-w-0 flex-wrap gap-2">
      <input name="importId" type="hidden" value={importId} /><input name="rowId" type="hidden" value={rowId} />
      <select aria-label="Сопоставленный товар Novotech" className="min-h-11 min-w-0 flex-1 border border-zinc-300 px-2 text-sm" name="productId" required>{products.length ? products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>) : <option value="">Нет кандидатов</option>}</select>
      <button className="min-h-11 border border-emerald-700 px-3 text-sm font-semibold text-emerald-800 disabled:opacity-50" disabled={!products.length} name="decision" value="map">Сопоставить</button>
      <button className="min-h-11 border border-zinc-300 px-3 text-sm font-semibold" formNoValidate name="decision" value="ignore">Игнорировать</button>
    </form>
  </div>;
}
