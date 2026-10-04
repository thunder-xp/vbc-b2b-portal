import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";
import { CampaignPerformance, CampaignResultsFilter } from "@/src/modules/commercial-campaigns/components/CampaignPerformance";
import { campaignPerformancePeriod, type CampaignPerformanceQuery } from "@/src/modules/commercial-campaigns/performance";

export default async function CampaignResultsPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<CampaignPerformanceQuery> }) {
  await requireAdminPagePermission("campaigns.view");
  const [{ campaignId }, query] = await Promise.all([params, searchParams]);
  let period;
  try { period = campaignPerformancePeriod(query); } catch (error) {
    return <div className="space-y-4"><h1 className="text-xl font-semibold">Результаты предложения</h1><p role="alert">{error instanceof Error ? error.message : "Некорректный период."}</p><CampaignResultsFilter query={query} /></div>;
  }
  const [summary] = await createCommercialCampaignService().getPerformance([campaignId], period);
  if (!summary) notFound();
  return <div className="min-w-0 space-y-5"><AdminPageHeader eyebrow="Специальные предложения" title="Результаты предложения" description={summary.name} />
    <Link className="text-sm text-emerald-800" href={`/admin/commercial/campaigns/${campaignId}`}>← К предложению</Link>
    <CampaignResultsFilter query={query} versions={summary.versions} /><CampaignPerformance summary={summary} />
  </div>;
}
