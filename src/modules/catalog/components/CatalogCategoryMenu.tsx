"use client";

import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type CatalogCategoryMenuItem = {
  id: string;
  parentId: string | null;
  name: string;
};

export type CatalogCategoryNode<T extends CatalogCategoryMenuItem = CatalogCategoryMenuItem> = T & {
  children: CatalogCategoryNode<T>[];
};

export function buildCategoryTree<T extends CatalogCategoryMenuItem>(categories: T[]): CatalogCategoryNode<T>[] {
  const nodes = new Map(categories.map((item) => [item.id, { ...item, children: [] as CatalogCategoryNode<T>[] }]));
  const roots: CatalogCategoryNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

type Labels = {
  back: string;
  close: string;
  dialog: string;
  selectCategory: string;
  selectDirection: string;
  trigger: string;
};

export function CatalogCategoryMenu<T extends CatalogCategoryMenuItem>({
  categories,
  categoryHref,
  labels,
  onOpen,
  square = false,
  tone = "default",
}: {
  categories: T[];
  categoryHref: (category: CatalogCategoryNode<T>) => string;
  labels: Labels;
  onOpen?: () => void;
  square?: boolean;
  tone?: "default" | "retail";
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

  return <div className="relative" ref={containerRef}>
    <button
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="menu"
      className={`inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold text-white ${tone === "retail" ? "bg-blue-700 hover:bg-blue-800" : "bg-emerald-700 hover:bg-emerald-800"} ${square ? "" : "rounded-md"}`}
      onClick={() => setOpen((value) => {
        if (!value) onOpen?.();
        return !value;
      })}
      ref={triggerRef}
      type="button"
    >
      <Menu aria-hidden="true" className="size-4" /> {labels.trigger}
    </button>
    {open ? <div
      aria-label={labels.dialog}
      aria-modal="true"
      className={`fixed inset-0 z-40 bg-white lg:absolute lg:inset-auto lg:left-0 lg:top-12 lg:w-[min(900px,calc(100vw-3rem))] lg:border lg:border-zinc-200 lg:shadow-xl ${square ? "" : "lg:rounded-lg"}`}
      id={menuId}
      ref={menuRef}
      role="dialog"
    >
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 lg:hidden">
        <button aria-label={labels.back} className="grid size-11 place-items-center" onClick={() => category ? setCategoryId(null) : direction ? setDirectionId(null) : setOpen(false)} type="button"><ChevronLeft className="size-5" /></button>
        <p className="font-semibold">{category?.name ?? direction?.name ?? labels.trigger}</p>
        <button aria-label={labels.close} className="grid size-11 place-items-center" onClick={() => setOpen(false)} type="button"><X className="size-5" /></button>
      </div>
      <div className="grid max-h-[calc(100vh-3.5rem)] overflow-auto p-3 lg:grid-cols-3 lg:gap-4 lg:p-5">
        <div className={`${direction ? "hidden" : "block"} lg:block`}><CategoryColumn categoryHref={categoryHref} items={tree} onChoose={(id) => { setDirectionId(id); setCategoryId(null); }} onNavigate={() => setOpen(false)} selectedId={directionId} tone={tone} /></div>
        <div className={`${direction && !category ? "block" : "hidden"} lg:block`}>
          {direction ? <CategoryColumn categoryHref={categoryHref} items={direction.children} onChoose={setCategoryId} onNavigate={() => setOpen(false)} selectedId={categoryId} tone={tone} /> : <MenuHint text={labels.selectDirection} />}
        </div>
        <div className={`${category ? "block" : "hidden"} lg:block`}>
          {category ? <CategoryLinks categoryHref={categoryHref} items={category.children.length ? category.children : [category]} onNavigate={() => setOpen(false)} tone={tone} /> : <MenuHint text={labels.selectCategory} />}
        </div>
      </div>
    </div> : null}
  </div>;
}

function CategoryColumn<T extends CatalogCategoryMenuItem>({ categoryHref, items, onChoose, onNavigate, selectedId, tone }: { categoryHref: (category: CatalogCategoryNode<T>) => string; items: CatalogCategoryNode<T>[]; onChoose: (id: string) => void; onNavigate: () => void; selectedId: string | null; tone: "default" | "retail" }) {
  return <div className="space-y-1">{items.map((item) => item.children.length ? (
    <button className={`flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm ${selectedId === item.id ? tone === "retail" ? "bg-blue-50 font-semibold text-blue-800" : "bg-emerald-50 font-semibold text-emerald-800" : "hover:bg-zinc-50"}`} key={item.id} onClick={() => onChoose(item.id)} type="button"><span>{item.name}</span><ChevronRight aria-hidden="true" className="size-4" /></button>
  ) : <Link className="flex min-h-11 items-center px-3 py-2 text-sm hover:bg-zinc-50" href={categoryHref(item)} key={item.id} onClick={onNavigate} prefetch={false}>{item.name}</Link>)}</div>;
}

function CategoryLinks<T extends CatalogCategoryMenuItem>({ categoryHref, items, onNavigate, tone }: { categoryHref: (category: CatalogCategoryNode<T>) => string; items: CatalogCategoryNode<T>[]; onNavigate: () => void; tone: "default" | "retail" }) {
  return <div className="space-y-1">{items.map((item) => <Link className={`flex min-h-11 items-center px-3 py-2 text-sm ${tone === "retail" ? "hover:bg-blue-50 hover:text-blue-800" : "hover:bg-emerald-50 hover:text-emerald-800"}`} href={categoryHref(item)} key={item.id} onClick={onNavigate} prefetch={false}>{item.name}</Link>)}</div>;
}

function MenuHint({ text }: { text: string }) {
  return <p className="px-3 py-2 text-sm text-zinc-500">{text}</p>;
}
