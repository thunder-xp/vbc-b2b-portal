"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCatalogComparisonAction, type CatalogComparisonDto } from "../actions";
import { readComparisonIds } from "./ProductComparisonAction";

export function ProductComparisonView({ categoryId, companyId, userId }: { categoryId: string; companyId: string; userId: string }) {
  const [comparison, setComparison] = useState<CatalogComparisonDto | null>(null);
  const [message, setMessage] = useState("Загрузка сравнения…");
  useEffect(() => {
    let active = true;
    const load = async () => {
      const ids = readComparisonIds(companyId, userId, categoryId);
      if (!ids.length) { await Promise.resolve(); if (active) setMessage("Добавьте товары одной категории в сравнение."); return; }
      const result = await getCatalogComparisonAction(ids);
      if (!active) return;
      if (result.success) setComparison(result.data); else setMessage(result.message);
    };
    void load();
    return () => { active = false; };
  }, [categoryId, companyId, userId]);
  if (!comparison) return <p className="py-10 text-sm text-zinc-600">{message}</p>;
  const views = new Map(comparison.commercialViews.map((view) => [view.productId, view]));
  return <div className="overflow-x-auto"><table className="min-w-[720px] border-collapse text-left text-sm"><caption className="sr-only">Сравнение товаров</caption><thead><tr><th className="border-b border-zinc-200 p-3 text-zinc-500">Параметр</th>{comparison.products.map((product) => <th className="border-b border-zinc-200 p-3" key={product.id}><Link className="font-semibold text-emerald-700" href={`/cabinet/catalog/${product.slug}`}>{product.name}</Link><span className="mt-1 block text-xs font-normal text-zinc-500">Артикул: {product.sku}</span></th>)}</tr></thead><tbody><Row label="Партнёрская цена" values={comparison.products.map((product) => views.get(product.id)?.partnerPrice?.formattedAmount ?? "Уточняется")} /><Row label="Наличие" values={comparison.products.map((product) => { const value = views.get(product.id)?.stock?.exactAvailableQuantity; return value === null || value === undefined ? "Уточняется" : `${value} шт.`; })} />{uniqueCharacteristics(comparison.products).map((label) => <Row key={label} label={label} values={comparison.products.map((product) => product.keyCharacteristics.find((item) => item.label === label)?.value ?? "—")} />)}</tbody></table></div>;
}

function Row({ label, values }: { label: string; values: string[] }) { return <tr><th className="border-b border-zinc-100 p-3 font-medium text-zinc-600">{label}</th>{values.map((value, index) => <td className="border-b border-zinc-100 p-3 text-zinc-900" key={`${value}:${index}`}>{value}</td>)}</tr>; }
function uniqueCharacteristics(products: CatalogComparisonDto["products"]): string[] { return [...new Set(products.flatMap((product) => product.keyCharacteristics.map((item) => item.label)))]; }
