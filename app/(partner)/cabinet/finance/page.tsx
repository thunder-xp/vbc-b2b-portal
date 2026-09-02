import { Suspense } from "react";

import { getFinanceOverviewAction } from "@/src/modules/finance/actions";
import {
  FinanceOverview,
  FinanceRefreshButton,
} from "@/src/modules/finance/components";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { listPartnerDocumentsAction } from "@/src/modules/documents/actions";
import { RelatedDocuments } from "@/src/modules/documents/components";
import { getFinanceCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const documentsPromise = listPartnerDocumentsAction({ section: "accounting", pageSize: 6 });
  const [result, locale] = await Promise.all([
    getFinanceOverviewAction(),
    getPartnerLocale(),
  ]);
  const copy = getFinanceCopy(locale);
  if (!result.success) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-4 text-sm text-zinc-600">
          {copy.unavailable}
        </p>
      </section>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BehaviorViewEvent
        dedupeKey="finance"
        eventName="finance_viewed"
        route="/cabinet/finance"
        sourceSurface="finance_overview"
      />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {copy.cabinet}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-950">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            {copy.description}
          </p>
        </div>
        <FinanceRefreshButton />
      </header>
      <FinanceOverview locale={locale} overview={result.data} />
      <Suspense fallback={<FinanceDocumentsLoading locale={locale} />}>
        <FinanceDocuments locale={locale} promise={documentsPromise} />
      </Suspense>
    </main>
  );
}

async function FinanceDocuments({
  locale,
  promise,
}: {
  locale: Awaited<ReturnType<typeof getPartnerLocale>>;
  promise: ReturnType<typeof listPartnerDocumentsAction>;
}) {
  const documentsResult = await promise;
  const copy = getFinanceCopy(locale);
  if (!documentsResult.success) {
    return (
      <section className="min-h-40 border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold text-zinc-950">{copy.documents}</h2>
        <p className="mt-3 text-sm text-zinc-600">
          {locale === "ro"
            ? "Documentele financiare sunt temporar indisponibile. Reîncărcați pagina mai târziu."
            : "Финансовые документы временно недоступны. Обновите страницу позже."}
        </p>
      </section>
    );
  }
  return (
    <RelatedDocuments
      documents={documentsResult.data.items}
      emptyMessage={copy.documentsEmpty}
      title={copy.documents}
    />
  );
}

function FinanceDocumentsLoading({
  locale,
}: {
  locale: Awaited<ReturnType<typeof getPartnerLocale>>;
}) {
  const copy = getFinanceCopy(locale);
  return (
    <section aria-busy="true" aria-label={copy.documents} className="min-h-40 border-t border-zinc-200 pt-6">
      <h2 className="text-lg font-semibold text-zinc-950">{copy.documents}</h2>
      <div aria-hidden="true" className="mt-4 space-y-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-zinc-100" />
      </div>
    </section>
  );
}
