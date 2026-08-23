import Link from "next/link";

export type PublicBreadcrumbItem = { name: string; url: string };

export function PublicBreadcrumbs({ items, label }: { items: PublicBreadcrumbItem[]; label: string }) {
  return <nav aria-label={label} className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
    {items.map((item, index) => <span className="flex items-center gap-2" key={item.url}>
      {index > 0 ? <span aria-hidden="true">/</span> : null}
      {index === items.length - 1
        ? <span aria-current="page" className="text-zinc-700">{item.name}</span>
        : <Link className="hover:text-blue-800" href={item.url}>{item.name}</Link>}
    </span>)}
  </nav>;
}
