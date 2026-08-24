import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicBlogArticleView } from "@/src/modules/public-blog/components";
import { getPublicBlogArticle } from "@/src/modules/public-blog/server";
import { PublicBreadcrumbs } from "@/src/modules/public-retail/components/PublicBreadcrumbs";
import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicArticleSchema, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const [article, alternate] = await Promise.all([getPublicBlogArticle(slug, locale), getPublicBlogArticle(slug, locale === "ru" ? "ro" : "ru")]);
  if (!article) return {};
  return buildPublicMetadata({ locale, path: `/blog/${slug}`, title: article.metaTitle || `${article.title} | Novotech`, description: article.metaDescription || article.excerpt, images: article.heroUrl ? [article.heroUrl] : undefined, openGraphType: "article", availableLocales: alternate ? ["ru", "ro"] : [locale] });
}

export default async function BlogArticlePage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const locale = publicRetailLocale(query.lang);
  const article = await getPublicBlogArticle(slug, locale);
  if (!article) notFound();
  const home = locale === "ro" ? "Principală" : "Главная";
  const blog = locale === "ro" ? "Blog" : "Блог";
  const breadcrumbs = [{ name: home, url: publicLocalizedUrl("/", locale) }, { name: blog, url: publicLocalizedUrl("/blog", locale) }, { name: article.title, url: publicLocalizedUrl(`/blog/${slug}`, locale) }];
  return <PublicRetailShell languagePath={`/blog/${slug}`} locale={locale}><PublicStructuredData data={[publicBreadcrumbSchema(breadcrumbs), publicArticleSchema({ locale, path: `/blog/${slug}`, title: article.title, description: article.excerpt, image: article.heroUrl, publishedAt: article.publishedAt, updatedAt: article.updatedAt })]} /><main className="px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1280px]"><PublicBreadcrumbs items={breadcrumbs} label={locale === "ro" ? "Navigare ierarhică" : "Хлебные крошки"} /></div><div className="mt-8"><PublicBlogArticleView article={article} locale={locale} /></div></main></PublicRetailShell>;
}
