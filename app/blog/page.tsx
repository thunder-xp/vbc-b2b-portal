import type { Metadata } from "next";
import Link from "next/link";

import { PublicBlogCardView, publicBlogCategoryLabel } from "@/src/modules/public-blog/components";
import { getPublicBlogLanding } from "@/src/modules/public-blog/server";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata } from "@/src/modules/public-retail/seo";

type Query = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Query }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({ locale, path: "/blog", title: locale === "ro" ? "Blog despre sisteme de securitate | Novotech" : "Блог о системах безопасности | Novotech", description: locale === "ro" ? "Ghiduri practice Novotech despre alegerea, instalarea și utilizarea echipamentelor de securitate." : "Практические материалы Novotech о выборе, монтаже и эксплуатации оборудования для систем безопасности." });
}

export default async function BlogPage({ searchParams }: { searchParams: Query }) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const category = single(query.category) || null;
  const page = Math.max(1, Number(single(query.page)) || 1);
  const landing = await getPublicBlogLanding(locale, category, page);
  const featured = page === 1 && !category ? landing.items.find((article) => article.featured) : null;
  const items = featured ? landing.items.filter((article) => article.id !== featured.id) : landing.items;
  const ru = locale === "ru";
  return <PublicRetailShell languagePath="/blog" locale={locale}><main className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
    <header className="max-w-3xl"><p className="public-brand-eyebrow text-xs font-semibold uppercase">Novotech</p><h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{ru ? "Блог" : "Blog"}</h1><p className="mt-4 text-base leading-7 text-zinc-600">{ru ? "Практические руководства по выбору, монтажу и использованию систем безопасности." : "Ghiduri practice pentru alegerea, instalarea și utilizarea sistemelor de securitate."}</p></header>
    {landing.categories.length ? <nav aria-label={ru ? "Категории блога" : "Categorii blog"} className="mt-7 flex gap-2 overflow-x-auto pb-2"><Link aria-current={!category ? "page" : undefined} className={filterClass(!category)} href={`/blog?lang=${locale}`}>{ru ? "Все" : "Toate"}</Link>{landing.categories.map((item) => <Link aria-current={category === item.slug ? "page" : undefined} className={filterClass(category === item.slug)} href={`/blog?lang=${locale}&category=${item.slug}`} key={item.slug}>{publicBlogCategoryLabel(item.slug, locale)} <span className="text-xs opacity-60">{item.count}</span></Link>)}</nav> : null}
    {featured ? <section className="mt-8"><PublicBlogCardView article={featured} featured locale={locale} /></section> : null}
    {items.length ? <section className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((article) => <PublicBlogCardView article={article} key={article.id} locale={locale} />)}</section> : !featured ? <p className="mt-10 border border-zinc-200 p-6 text-sm text-zinc-600">{ru ? "В этой категории пока нет опубликованных материалов." : "În această categorie nu sunt încă materiale publicate."}</p> : null}
    <Pagination locale={locale} page={page} total={landing.total} category={category} />
  </main></PublicRetailShell>;
}

function Pagination({ category, locale, page, total }: { category: string | null; locale: "ru" | "ro"; page: number; total: number }) { const pages = Math.ceil(total / 12); if (pages < 2) return null; const href = (target: number) => `/blog?lang=${locale}${category ? `&category=${category}` : ""}&page=${target}`; return <nav aria-label={locale === "ro" ? "Paginare" : "Пагинация"} className="mt-8 flex justify-center gap-2">{page > 1 ? <Link className="grid min-h-11 place-items-center border border-zinc-300 px-4" href={href(page - 1)}>←</Link> : null}<span className="grid min-h-11 place-items-center px-4 text-sm">{page} / {pages}</span>{page < pages ? <Link className="grid min-h-11 place-items-center border border-zinc-300 px-4" href={href(page + 1)}>→</Link> : null}</nav>; }
function filterClass(active: boolean) { return `inline-flex min-h-11 shrink-0 items-center gap-2 border px-4 text-sm font-semibold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-zinc-300 hover:border-blue-700 hover:text-blue-800"}`; }
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
