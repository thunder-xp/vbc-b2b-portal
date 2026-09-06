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
import { PageHeader } from "@/src/modules/platform-ui";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [result, documentsResult, locale] = await Promise.all([
    getFinanceOverviewAction(),
    listPartnerDocumentsAction({ section: "accounting", pageSize: 6 }),
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
    <div className="mx-auto max-w-6xl space-y-4">
      <BehaviorViewEvent
        dedupeKey="finance"
        eventName="finance_viewed"
        route="/cabinet/finance"
        sourceSurface="finance_overview"
      />
      <PageHeader compact title={copy.title} actions={<FinanceRefreshButton />} />
      <FinanceOverview locale={locale} overview={result.data} />
      <RelatedDocuments
        documents={documentsResult.success ? documentsResult.data.items : []}
        emptyMessage={copy.documentsEmpty}
        title={copy.documents}
      />
    </div>
  );
}
