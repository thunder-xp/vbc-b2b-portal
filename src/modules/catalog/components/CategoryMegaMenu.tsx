"use client";

import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { CatalogCategoryDto, CatalogSort } from "../services";
import { buildCatalogHref } from "../services/catalog-sort-state";
import type { MerchandisingLabelCode } from "../../merchandising/types";
import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";

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

export function CategoryMegaMenu({
  categories,
  merchandisingLabel,
  sort = "default",
}: {
  categories: CatalogCategoryDto[];
  merchandisingLabel?: MerchandisingLabelCode;
  sort?: CatalogSort;
}) {
  const [open, setOpen] = useState(false);
  const [directionId, setDirectionId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const tree = buildCategoryTree(categories);
  const direction = tree.find((item) => item.id === directionId) ?? null;
  const category = direction?.children.find((item) => item.id === categoryId) ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>("button, a")?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !menu) return;
      const items = [...menu.querySelectorAll<HTMLElement>("button, a")]
        .filter((item) => !item.hasAttribute("disabled"));
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
      <button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" className="inline-flex h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800" onClick={() => setOpen((value) => {
        if (!value) {
          recordBehaviorInteraction({
            eventName: "filters_applied",
            metadataSafe: { action: "category_launcher_opened" },
            route: "/cabinet/catalog",
            sourceSurface: "category_launcher",
          });
        }
        return !value;
      })} ref={triggerRef} type="button">
        <Menu aria-hidden="true" className="size-4" /> Категории
      </button>
      {open && (
        <div aria-label="Категории каталога" aria-modal="true" className="fixed inset-0 z-40 bg-white lg:absolute lg:inset-auto lg:left-0 lg:top-12 lg:w-[min(900px,calc(100vw-3rem))] lg:rounded-lg lg:border lg:border-zinc-200 lg:shadow-xl" id={menuId} ref={menuRef} role="dialog">
          <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 lg:hidden">
            <button aria-label="Назад" className="p-2" onClick={() => category ? setCategoryId(null) : direction ? setDirectionId(null) : setOpen(false)} type="button"><ChevronLeft className="size-5" /></button>
            <p className="font-semibold">{category?.name ?? direction?.name ?? "Категории"}</p>
            <button aria-label="Закрыть категории" className="p-2" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button>
          </div>
          <div className="grid max-h-[calc(100vh-3.5rem)] overflow-auto p-3 lg:grid-cols-3 lg:gap-4 lg:p-5">
            <div className={`${direction ? "hidden" : "block"} lg:block`}><CategoryColumn items={tree} merchandisingLabel={merchandisingLabel} onChoose={(id) => { setDirectionId(id); setCategoryId(null); }} onNavigate={() => setOpen(false)} selectedId={directionId} sort={sort} /></div>
            <div className={`${direction && !category ? "block" : "hidden"} lg:block`}>
              {direction ? <CategoryColumn items={direction.children} merchandisingLabel={merchandisingLabel} onChoose={setCategoryId} onNavigate={() => setOpen(false)} selectedId={categoryId} sort={sort} /> : <MenuHint text="Выберите направление" />}
            </div>
            <div className={`${category ? "block" : "hidden"} lg:block`}>
              {category ? <CategoryLinks items={category.children.length ? category.children : [category]} merchandisingLabel={merchandisingLabel} onNavigate={() => setOpen(false)} sort={sort} /> : <MenuHint text="Выберите категорию" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryColumn({ items, merchandisingLabel, onChoose, onNavigate, selectedId, sort }: { items: CatalogCategoryNode[]; merchandisingLabel?: MerchandisingLabelCode; onChoose: (id: string) => void; onNavigate: () => void; selectedId: string | null; sort: CatalogSort }) {
  return <div className="space-y-1">{items.map((item) => item.children.length ? (
    <button className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedId === item.id ? "bg-emerald-50 font-semibold text-emerald-800" : "hover:bg-zinc-50"}`} key={item.id} onClick={() => onChoose(item.id)} type="button"><span>{item.name}</span><ChevronRight className="size-4" /></button>
  ) : <Link className="block rounded-md px-3 py-2 text-sm hover:bg-zinc-50" href={buildCatalogHref({ categoryId: item.id, merchandisingLabel, sort })} key={item.id} onClick={onNavigate} prefetch={false}>{item.name}</Link>)}</div>;
}

function CategoryLinks({ items, merchandisingLabel, onNavigate, sort }: { items: CatalogCategoryNode[]; merchandisingLabel?: MerchandisingLabelCode; onNavigate: () => void; sort: CatalogSort }) {
  return <div className="space-y-1">{items.map((item) => <Link className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-50 hover:text-emerald-800" href={buildCatalogHref({ categoryId: item.id, merchandisingLabel, sort })} key={item.id} onClick={onNavigate} prefetch={false}>{item.name}</Link>)}</div>;
}

function MenuHint({ text }: { text: string }) { return <p className="px-3 py-2 text-sm text-zinc-500">{text}</p>; }
