"use client";

import { useState, useTransition } from "react";

import { runAdminSyncAction } from "../actions";
import type { AdminStockReconciliation } from "../types";

export function AdminStockReconciliationView({canRun,reconciliation}:{canRun:boolean;reconciliation:AdminStockReconciliation}){
  const[pending,startTransition]=useTransition();
  const[message,setMessage]=useState<string|null>(null);
  const latest=reconciliation.latest;
  const metrics=latest?[
    ["Опубликованные товары",latest.totalProducts],
    ["Точные совпадения",latest.exactMatches],
    ["1С: 0 / портал: больше 0",latest.sourceZeroLocalPositive],
    ["1С: больше 0 / портал: 0",latest.sourcePositiveLocalZero],
    ["Изменение количества",latest.quantityMismatches],
    ["Нет сопоставления товара",latest.missingProductMappings],
    ["Нет сопоставления склада",latest.missingWarehouseMappings],
    ["Дубли источника",latest.duplicateSourceRows],
  ]as const:[];
  function run(){startTransition(async()=>{const result=await runAdminSyncAction("stock","Проверка целостности опубликованных остатков");setMessage(result.message);});}
  return <section className="space-y-4 border-t border-zinc-200 pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">Сверка остатков</h2><p className="mt-1 text-sm text-zinc-600">Последний полный снимок 1С сравнивается с предыдущей и опубликованной версиями без запросов к 1С при открытии страницы.</p></div>{canRun?<button className="min-h-11 border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50" disabled={pending} onClick={run} type="button">{pending?"Запуск...":"Перепроверить остатки"}</button>:null}</div>
    {message?<p aria-live="polite" className="text-sm text-zinc-700">{message}</p>:null}
    {latest?<><p className="text-xs text-zinc-600">Снимок: {new Date(latest.snapshotTime).toLocaleString("ru-RU")}. Область складов: {latest.warehouseScopeVersion}.</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label,value])=><article className="border border-zinc-200 bg-white p-4" key={label}><p className="text-xs uppercase text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p></article>)}</div></>:<p className="text-sm text-zinc-600">Полная сверка ещё не выполнялась.</p>}
    {reconciliation.changes.length?<div className="overflow-x-auto border border-zinc-200"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Товар</th><th className="px-4 py-3">Было</th><th className="px-4 py-3">1С</th><th className="px-4 py-3">Опубликовано</th></tr></thead><tbody className="divide-y divide-zinc-100">{reconciliation.changes.map(item=><tr key={item.productId}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.name}</td><td className="px-4 py-3">{item.previousAvailable??"нет"}</td><td className="px-4 py-3">{item.sourceAvailable}</td><td className="px-4 py-3">{item.publishedAvailable??"нет"}</td></tr>)}</tbody></table></div>:null}
  </section>;
}
