import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, FileText, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { availabilityCopy, availabilityTone, formatRetailPrice, publicRetailLocale, retailCopy } from "@/src/modules/public-retail/presentation";
import { getPublicRetailProduct } from "@/src/modules/public-retail/server";
import { PublicRetailAddToCartButton } from "@/src/modules/public-retail/components/PublicRetailAddToCartButton";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const product = await getPublicRetailProduct(slug, locale).catch(() => null);
  if (!product) return {};
  return { title: `${product.name} | Novotech`, description: product.shortDescription ?? `${product.name}. Розничная цена и характеристики.`, alternates: { canonical: `/products/${product.slug}` } };
}
export default async function PublicProductPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const product = await getPublicRetailProduct(slug, locale);
  if (!product) notFound();
  const copy = retailCopy[locale];
  const images = product.gallery.length ? product.gallery : product.image ? [product.image] : [];
  return <PublicRetailShell languagePath={`/products/${product.slug}`} locale={locale}><main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
    <nav aria-label="Хлебные крошки" className="flex flex-wrap gap-2 text-xs text-zinc-500"><Link href={`/catalog?lang=${locale}`}>{copy.catalog}</Link>{product.categoryPath.map((category) => <span className="flex gap-2" key={category.id}><span aria-hidden="true">/</span><Link href={`/catalog?lang=${locale}&category=${category.slug}`}>{category.name}</Link></span>)}</nav>
    <div className="mt-6 grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
      <section aria-label={locale === "ro" ? "Imagini produs" : "Изображения товара"}>{images.length ? <div className="grid gap-3 sm:grid-cols-2">{images.slice(0, 4).map((image, index) => <div className={`relative aspect-[4/3] overflow-hidden bg-zinc-50 ${index === 0 ? "sm:col-span-2" : ""}`} key={image.url}><Image alt={image.alt || product.name} className="object-contain p-6" fill priority={index === 0} sizes={index === 0 ? "(max-width: 1024px) 100vw, 60vw" : "30vw"} src={image.url} /></div>)}</div> : <div className="grid aspect-[4/3] place-items-center bg-zinc-50 text-zinc-300"><ImageIcon aria-hidden="true" className="size-16" /><span className="sr-only">Изображение отсутствует</span></div>}</section>
      <section className="lg:sticky lg:top-24 lg:self-start"><p className="text-xs font-semibold uppercase text-zinc-500">{product.brand?.name ?? product.categoryPath.at(-1)?.name ?? "Novotech"}</p><h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{product.name}</h1><p className="mt-3 text-sm text-zinc-500">{copy.sku}: {product.sku}</p><div className="mt-7 border-y border-zinc-200 py-6"><p className="text-3xl font-semibold tabular-nums">{formatRetailPrice(product.price.amount, product.price.currency, locale)}</p><p className="mt-1 text-xs text-zinc-500">{copy.price}</p><p className={`mt-4 text-sm font-semibold ${availabilityTone(product.availability)}`}>{availabilityCopy[locale][product.availability]}</p></div>{product.shortDescription ? <p className="mt-6 text-sm leading-7 text-zinc-600">{product.shortDescription}</p> : null}<div className="mt-6"><PublicRetailAddToCartButton locale={locale} publicProductId={product.id} source="product_detail" /></div>{product.calculatorEligible ? <Link className="mt-3 flex min-h-12 items-center justify-center border border-zinc-300 px-5 text-sm font-semibold hover:border-emerald-700" href={`/calculator/cctv?lang=${locale}`}>{copy.chooseSystem}</Link> : null}</section>
    </div>
    {product.specifications.length ? <section className="mt-14 border-t border-zinc-200 pt-8"><h2 className="text-2xl font-semibold">{copy.specifications}</h2><dl className="mt-5 grid gap-x-8 sm:grid-cols-2">{product.specifications.map((item) => <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 border-b border-zinc-100 py-3 text-sm" key={`${item.key}:${item.value}`}><dt className="text-zinc-500">{item.label}</dt><dd className="break-words font-medium">{item.value}</dd></div>)}</dl></section> : null}
    {product.datasheet ? <section className="mt-10 border-t border-zinc-200 pt-8"><h2 className="text-2xl font-semibold">{copy.documents}</h2><div className="mt-4 flex min-h-14 flex-wrap items-center justify-between gap-3 border border-zinc-200 p-3 sm:max-w-xl"><span className="flex items-center gap-3 text-sm font-semibold"><FileText aria-hidden="true" className="size-5 text-emerald-700" />{copy.datasheet}</span><a aria-label={`${copy.openDocument}: ${copy.datasheet}`} className="inline-flex min-h-11 items-center gap-2 bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700" href={product.datasheet.url} rel="noopener noreferrer" target="_blank">{copy.openDocument}<ExternalLink aria-hidden="true" className="size-4" /></a></div></section> : null}
    {product.description ? <section className="mt-12 max-w-4xl"><h2 className="text-2xl font-semibold">{copy.description}</h2><p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600">{product.description}</p></section> : null}
    <Link className="mt-10 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-700" href={`/catalog?lang=${locale}`}><ArrowLeft aria-hidden="true" className="size-4" />{copy.backToCatalog}</Link>
  </main></PublicRetailShell>;
}
