"use client";

import { Columns3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const MAX_PRODUCTS = 4;

export function ProductComparisonAction({ categoryId, companyId, compact = false, productId, userId }: { categoryId: string | null; companyId: string; compact?: boolean; productId: string; userId: string }) {
  const storageKey = useMemo(() => comparisonStorageKey(companyId, userId, categoryId ?? "uncategorized"), [categoryId, companyId, userId]);
  const [ids, setIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => setIds(readIds(storageKey))); return () => cancelAnimationFrame(frame); }, [storageKey]);
  const selected = ids.includes(productId);
  const toggle = () => {
    const current = readIds(storageKey);
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : current.length < MAX_PRODUCTS ? [...current, productId] : current;
    localStorage.setItem(storageKey, JSON.stringify(next));
    setIds(next);
    setMessage(current.length >= MAX_PRODUCTS && !current.includes(productId) ? "Можно сравнить не более 4 товаров." : next.includes(productId) ? "Товар добавлен к сравнению." : "Товар удалён из сравнения.");
  };
  const label = selected ? "В сравнении" : "В сравнение";
  return <div className="space-y-1"><button aria-label={compact ? label : undefined} aria-pressed={selected} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 ${compact ? "size-9 p-0" : "px-3"}`} onClick={toggle} title={compact ? label : undefined} type="button"><Columns3 aria-hidden="true" className="size-4" />{compact ? null : label}</button>{!compact && ids.length ? <Link className="block text-xs font-medium text-emerald-700" href={`/cabinet/compare?category=${encodeURIComponent(categoryId ?? "uncategorized")}`} prefetch={false}>Сравнить ({ids.length})</Link> : null}{message ? <p aria-live="polite" className="sr-only">{message}</p> : null}</div>;
}

export function comparisonStorageKey(companyId: string, userId: string, categoryId: string): string { return `novotech-catalog-compare:${companyId}:${userId}:${categoryId}`; }
export function readComparisonIds(companyId: string, userId: string, categoryId: string): string[] { return readIds(comparisonStorageKey(companyId, userId, categoryId)); }
function readIds(key: string): string[] { try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))].slice(0, MAX_PRODUCTS) : []; } catch { return []; } }
