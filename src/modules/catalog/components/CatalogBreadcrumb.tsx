import Link from "next/link";
import type { CatalogCategoryDto } from "../services";

export function CatalogBreadcrumb({ categories, selectedId }: { categories: CatalogCategoryDto[]; selectedId?: string }) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: CatalogCategoryDto[] = [];
  let current = selectedId ? byId.get(selectedId) : undefined;
  while (current && path.length < 3) { path.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined; }
  return <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-2 text-sm text-zinc-500"><Link href="/cabinet/catalog" prefetch={false}>Каталог</Link>{path.map((item) => <span className="flex items-center gap-2" key={item.id}><span>/</span><Link className="text-zinc-700 hover:text-emerald-700" href={`/cabinet/catalog?category=${item.id}`} prefetch={false}>{item.name}</Link></span>)}</nav>;
}
