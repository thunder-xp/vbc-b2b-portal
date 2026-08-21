import { Search } from "lucide-react";
import Link from "next/link";
import {
  knowledgeTypeLabel,
  secondaryCopy,
  type PartnerLocale,
} from "@/src/modules/partner-locale";

import { type KnowledgeCard, type KnowledgeLanding } from "./types";

export function KnowledgeCardView({
  article,
  locale = "ru",
}: {
  article: KnowledgeCard;
  locale?: PartnerLocale;
}) {
  return (
    <Link
      className="group block min-h-32 border border-zinc-200 bg-white p-5 outline-none transition hover:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-600"
      href={`/cabinet/knowledge/${article.slug}`}
    >
      <p className="text-xs font-semibold text-emerald-700">
        {knowledgeTypeLabel(locale, article.articleType)}
      </p>
      <h3 className="mt-2 font-semibold text-zinc-950 group-hover:text-emerald-800">
        {article.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
        {article.summary}
      </p>
      {article.category ? (
        <p className="mt-3 text-xs text-zinc-500">{article.category}</p>
      ) : null}
    </Link>
  );
}

export function KnowledgeLandingView({
  data,
  results,
  query,
  locale = "ru",
}: {
  data: KnowledgeLanding;
  results: KnowledgeCard[];
  query: string;
  locale?: PartnerLocale;
}) {
  const copy = secondaryCopy(locale);
  return (
    <div className="space-y-8">
      <form className="flex gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{copy.knowledgeSearchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-3 size-5 text-zinc-400" />
          <input
            className="min-h-11 w-full border border-zinc-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            defaultValue={query}
            name="q"
            placeholder={copy.knowledgeSearchPlaceholder}
          />
        </label>
        <button
          className="min-h-11 bg-emerald-700 px-5 text-sm font-semibold text-white"
          type="submit"
        >
          {copy.knowledgeSearch}
        </button>
      </form>
      {query ? (
        <Section title={`${copy.knowledgeResults}: ${results.length}`}>
          {results.length ? (
            results.map((article) => (
              <KnowledgeCardView
                article={article}
                key={article.id}
                locale={locale}
              />
            ))
          ) : (
            <p className="border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
              {copy.knowledgeNotFound}
            </p>
          )}
        </Section>
      ) : (
        <>
          <Section title={copy.knowledgeFeatured}>
            {data.featured.map((article) => (
              <KnowledgeCardView
                article={article}
                key={article.id}
                locale={locale}
              />
            ))}
          </Section>
          {data.categories.length ? (
            <section>
              <h2 className="text-lg font-semibold">
                {copy.knowledgeCategories}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.categories.map((category) => (
                  <span
                    className="border border-zinc-200 bg-white px-3 py-2 text-sm"
                    key={category.id}
                  >
                    {category.name}{" "}
                    <span className="text-zinc-500">
                      {category.articleCount}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <Section title={copy.knowledgeRecent}>
            {data.recent.map((article) => (
              <KnowledgeCardView
                article={article}
                key={article.id}
                locale={locale}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}
