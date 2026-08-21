import Link from "next/link";
import { notFound } from "next/navigation";

import {
  OneCServiceHistorySummary,
  getOneCServiceHistoryAction,
} from "@/src/modules/service-history";
import { serviceCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ServiceHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale] = await Promise.all([params, getPartnerLocale()]);
  const copy = serviceCopy(locale);
  const result = await getOneCServiceHistoryAction(id);
  if (!result.success || !result.data) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700"
          href="/cabinet/service"
        >
          ← {copy.historyBack}
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase text-emerald-700">
          {copy.document}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{result.data.number}</h1>
      </header>
      <OneCServiceHistorySummary detail={result.data} locale={locale} />
    </div>
  );
}
