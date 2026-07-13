"use client";

import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { CatalogCategoryDto } from "../services";

export type CatalogCategoryNode = CatalogCategoryDto & { children: CatalogCategoryNode[] };

export function buildCategoryTree(categories: CatalogCategoryDto[]): CatalogCategoryNode[] {
  const nodes = new Map(categories.map((category) => [category.id, { ...category, children: [] as CatalogCategoryNode[] }]));
  const roots: CatalogCategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function CategoryMegaMenu({ categories }: { categories: CatalogCategoryDto[] }) {
  const [open, setOpen] = useState(false);
  const [directionId, setDirectionId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const tree = buildCategoryTree(categories);
  const direction = tree.find((item) => item.id === directionId) ?? null;
  const category = direction?.children.find((item) => item.id === categoryId) ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" className="inline-flex h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
        <Menu aria-hidden="true" className="size-4" /> Категории
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-white lg:absolute lg:inset-auto lg:left-0 lg:top-12 lg:w-[min(900px,calc(100vw-3rem))] lg:rounded-lg lg:border lg:border-zinc-200 lg:shadow-xl" id={menuId}>
          <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 lg:hidden">
            <button aria-label="Назад" className="p-2" onClick={() => category ? setCategoryId(null) : direction ? setDirectionId(null) : setOpen(false)} type="button"><ChevronLeft className="size-5" /></button>
            <p className="font-semibold">{category?.name ?? direction?.name ?? "Категории"}</p>
            <button aria-label="Закрыть категории" className="p-2" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button>
          </div>
          <div className="grid max-h-[calc(100vh-3.5rem)] overflow-auto p-3 lg:grid-cols-3 lg:gap-4 lg:p-5">
            <div className={`${direction ? "hidden" : "block"} lg:block`}><CategoryColumn items={tree} onChoose={(id) => { setDirectionId(id); setCategoryId(null); }} onNavigate={() => setOpen(false)} selectedId={directionId} /></div>
            <div className={`${direction && !category ? "block" : "hidden"} lg:block`}>
              {direction ? <CategoryColumn items={direction.children} onChoose={setCategoryId} onNavigate={() => setOpen(false)} selectedId={categoryId} /> : <MenuHint text="Выберите направление" />}
            </div>
            <div className={`${category ? "block" : "hidden"} lg:block`}>
              {category ? <CategoryLinks items={category.children.length ? category.children : [category]} onNavigate={() => setOpen(false)} /> : <MenuHint text="Выберите категорию" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryColumn({ items, onChoose, onNavigate, selectedId }: { items: CatalogCategoryNode[]; onChoose: (id: string) => void; onNavigate: () => void; selectedId: string | null }) {
  return <div className="space-y-1">{items.map((item) => item.children.length ? (
    <button className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedId === item.id ? "bg-emerald-50 font-semibold text-emerald-800" : "hover:bg-zinc-50"}`} key={item.id} onClick={() => onChoose(item.id)} type="button"><span>{item.name}</span><ChevronRight className="size-4" /></button>
  ) : <Link className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-50" href={`/cabinet/catalog?category=${item.id}`} key={item.id} onClick={onNavigate}>{item.name}</Link>)}</div>;
}

function CategoryLinks({ items, onNavigate }: { items: CatalogCategoryNode[]; onNavigate: () => void }) {
  return <div className="space-y-1">{items.map((item) => <Link className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-800" href={`/cabinet/catalog?category=${item.id}`} key={item.id} onClick={onNavigate}>{item.name}</Link>)}</div>;
}

function MenuHint({ text }: { text: string }) { return <p className="px-3 py-2 text-sm text-zinc-500">{text}</p>; }
