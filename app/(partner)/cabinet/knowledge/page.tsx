import { BookOpen } from "lucide-react";
import {
  getKnowledgeLandingAction,
  searchKnowledgeAction,
} from "@/src/modules/knowledge-base/actions";
import { KnowledgeLandingView } from "@/src/modules/knowledge-base/landing-components";
import { secondaryCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams,
    getPartnerLocale(),
  ]);
  const copy = secondaryCopy(locale);
  const query = params.q?.trim() ?? "";
  const [landing, search] = await Promise.all([
    getKnowledgeLandingAction(),
    query ? searchKnowledgeAction(query) : Promise.resolve(null),
  ]);
  if (!landing.success || !landing.data)
    return (
      <p className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {copy.knowledgeUnavailable}
      </p>
    );
  return (
    <div className="space-y-6">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
          <BookOpen className="size-4" />
          {copy.knowledgeEyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{copy.knowledgeTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {copy.knowledgeDescription}
        </p>
      </header>
      <KnowledgeLandingView
        data={landing.data}
        locale={locale}
        query={query}
        results={search?.success ? search.data : []}
      />
    </div>
  );
}
