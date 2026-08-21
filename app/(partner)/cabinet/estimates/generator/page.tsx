import Link from "next/link";

import { listEstimateCurrenciesAction } from "@/src/modules/estimates/actions";
import { ProposalGeneratorWorkspace } from "@/src/modules/estimates/components/ProposalGeneratorWorkspace";
import { getEstimatesCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ProposalGeneratorPage() {
  const [currencies, locale] = await Promise.all([listEstimateCurrenciesAction(), getPartnerLocale()]);
  const copy = getEstimatesCopy(locale);
  if (!currencies.success) return <div className="space-y-4"><Link className="text-sm font-semibold text-emerald-700" href="/cabinet/estimates">← {copy.title}</Link><p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{copy.loadError}</p></div>;
  return <ProposalGeneratorWorkspace currencies={currencies.data} />;
}
