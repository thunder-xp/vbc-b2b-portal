import { ArrowRight, CalendarDays, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CatalogProductGridFrame } from "../catalog/components/CatalogPresentationPrimitives";
import { PublicRetailProductCard } from "../public-retail/components/PublicRetailProductCard";
import type { PublicRetailLocale } from "../public-retail/types";
import type { PublicBlogArticle, PublicBlogBlock, PublicBlogCard } from "./types";

const CATEGORY_LABELS = {
  "video-surveillance": { ru: "Видеонаблюдение", ro: "Supraveghere video" },
  "access-control": { ru: "Контроль доступа", ro: "Control acces" },
  networks: { ru: "Сети", ro: "Rețele" },
  installation: { ru: "Монтаж", ro: "Instalare" },
  security: { ru: "Безопасность", ro: "Securitate" },
  guides: { ru: "Руководства", ro: "Ghiduri" },
} as const;

export function publicBlogCategoryLabel(slug: string, locale: PublicRetailLocale) {
  return CATEGORY_LABELS[slug as keyof typeof CATEGORY_LABELS]?.[locale] ?? slug.replaceAll("-", " ");
}

export function PublicBlogCardView({ article, locale, featured = false }: { article: PublicBlogCard; locale: PublicRetailLocale; featured?: boolean }) {
  const href = `/blog/${article.slug}?lang=${locale}`;
  return <article className={`group grid min-w-0 border border-zinc-200 bg-white ${featured ? "md:grid-cols-[1.1fr_.9fr]" : "grid-rows-[auto_1fr]"}`}>
    <Link aria-label={article.title} className={`relative block overflow-hidden bg-zinc-100 ${featured ? "aspect-[16/10] md:aspect-auto" : "aspect-[16/10]"}`} href={href}>
      {article.heroUrl ? <Image alt={article.heroAlt || article.title} className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" fetchPriority={featured ? "high" : "auto"} fill loading={featured ? "eager" : "lazy"} sizes={featured ? "(max-width: 768px) 100vw, 55vw" : "(max-width: 768px) 100vw, 33vw"} src={article.heroUrl} /> : <span className="grid size-full place-items-center text-zinc-300"><ImageIcon aria-hidden="true" className="size-12" /></span>}
    </Link>
    <div className={featured ? "p-6 sm:p-8" : "p-5"}>
      <p className="text-xs font-semibold uppercase text-blue-700">{publicBlogCategoryLabel(article.categorySlug, locale)}</p>
      <h2 className={`${featured ? "mt-3 text-2xl sm:text-3xl" : "mt-2 text-lg"} font-semibold leading-tight`}><Link className="hover:text-blue-800" href={href}>{article.title}</Link></h2>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">{article.excerpt}</p>
      <div className="mt-5 flex items-center justify-between gap-3 text-xs text-zinc-500"><time dateTime={article.publishedAt}>{formatBlogDate(article.publishedAt, locale)}</time><Link className="inline-flex min-h-11 items-center gap-2 font-semibold text-blue-800" href={href}>{locale === "ro" ? "Citește" : "Читать"}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
    </div>
  </article>;
}

export function PublicBlogArticleView({ article, locale }: { article: PublicBlogArticle; locale: PublicRetailLocale }) {
  const ru = locale === "ru";
  return <article>
    <header className="mx-auto max-w-4xl">
      <p className="text-xs font-semibold uppercase text-blue-700">{publicBlogCategoryLabel(article.categorySlug, locale)}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{article.title}</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">{article.excerpt}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-zinc-500"><span className="inline-flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4" /><time dateTime={article.publishedAt}>{formatBlogDate(article.publishedAt, locale)}</time></span><span>Novotech</span></div>
    </header>
    {article.heroUrl ? <div className="relative mx-auto mt-8 aspect-[16/9] max-w-6xl overflow-hidden bg-zinc-100"><Image alt={article.heroAlt || article.title} className="object-cover" fetchPriority="high" fill loading="eager" sizes="(max-width: 1280px) 100vw, 1152px" src={article.heroUrl} /></div> : null}
    <div className="mx-auto mt-10 max-w-3xl space-y-5 text-base leading-8 text-zinc-700">{article.content.map((block, index) => <PublicBlogBlockView block={block} key={`${block.type}-${index}`} />)}</div>
    {article.categories.length || article.services.length ? <RelatedLinks title={ru ? "Продолжить выбор" : "Continuați alegerea"}>
      {article.categories.map((category) => <Link className="inline-flex min-h-11 items-center border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={`/catalog?lang=${locale}&category=${category.slug}`} key={category.id}>{category.name}</Link>)}
      {article.services.map((service) => <Link className="inline-flex min-h-11 items-center border border-zinc-300 px-4 text-sm font-semibold hover:border-blue-700 hover:text-blue-800" href={`${service.href}?lang=${locale}`} key={service.key}>{serviceLabel(service.key, locale)}</Link>)}
    </RelatedLinks> : null}
    {article.products.length ? <section className="mx-auto mt-12 max-w-[1280px] border-t border-zinc-200 pt-8"><h2 className="text-2xl font-semibold">{ru ? "Подходящее оборудование" : "Echipamente potrivite"}</h2><div className="mt-5"><CatalogProductGridFrame>{article.products.map((product) => <PublicRetailProductCard key={product.id} locale={locale} product={product} />)}</CatalogProductGridFrame></div></section> : null}
    {article.related.length ? <section className="mx-auto mt-12 max-w-[1280px] border-t border-zinc-200 pt-8"><h2 className="text-2xl font-semibold">{ru ? "Материалы по теме" : "Materiale conexe"}</h2><div className="mt-5 grid gap-5 md:grid-cols-3">{article.related.map((related) => <PublicBlogCardView article={related} key={related.id} locale={locale} />)}</div></section> : null}
  </article>;
}

export function PublicBlogInlineLinks({ articles, locale, title }: { articles: PublicBlogCard[]; locale: PublicRetailLocale; title: string }) {
  if (!articles.length) return null;
  return <section className="mt-12 border-t border-zinc-200 pt-8" aria-labelledby="public-blog-inline-heading"><h2 className="text-2xl font-semibold" id="public-blog-inline-heading">{title}</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{articles.map((article) => <PublicBlogCardView article={article} key={article.id} locale={locale} />)}</div></section>;
}

function PublicBlogBlockView({ block }: { block: PublicBlogBlock }) {
  if (block.type === "heading2") return <h2 className="pt-5 text-2xl font-semibold leading-tight text-zinc-950">{block.text}</h2>;
  if (block.type === "heading3") return <h3 className="pt-3 text-xl font-semibold leading-tight text-zinc-950">{block.text}</h3>;
  if (block.type === "paragraph") return <p>{block.text}</p>;
  const List = block.type === "ordered_list" ? "ol" : "ul";
  return <List className={`space-y-2 pl-6 ${block.type === "ordered_list" ? "list-decimal" : "list-disc"}`}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</List>;
}
function RelatedLinks({ children, title }: { children: ReactNode; title: string }) { return <section className="mx-auto mt-10 max-w-3xl border-t border-zinc-200 pt-7"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 flex flex-wrap gap-3">{children}</div></section>; }
function formatBlogDate(value: string, locale: PublicRetailLocale) { return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)); }
function serviceLabel(key: string, locale: PublicRetailLocale) { const ru = locale === "ru"; return key === "cctv_calculator" ? (ru ? "Подобрать CCTV" : "Calculează CCTV") : key === "installation" ? (ru ? "Монтаж" : "Instalare") : (ru ? "Каталог" : "Catalog"); }
