import Link from "next/link";
import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";
import { CampaignResultsComparison, CampaignResultsFilter } from "@/src/modules/commercial-campaigns/components/CampaignPerformance";
import { campaignPerformancePeriod, type CampaignPerformanceQuery } from "@/src/modules/commercial-campaigns/performance";

export default async function CampaignComparisonPage({ searchParams }: { searchParams: Promise<CampaignPerformanceQuery & { page?: string }> }) {
  await requireAdminPagePermission("campaigns.view");
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  let period;
  try { period = campaignPerformancePeriod({ ...query, version: undefined }); } catch (error) {
    return <div className="space-y-4"><h1 className="text-xl">Результаты предложений</h1><p role="alert">{error instanceof Error ? error.message : "Некорректный период."}</p><CampaignResultsFilter query={query} /></div>;
  }
  const service = createCommercialCampaignService();
  const campaigns = await service.listAdmin({ page, pageSize: 20 });
  const summaries = await service.getPerformance(campaigns.items.map(c => c.id), period);
  const href = (target: number) => { const q = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value && key !== "version") q.set(key, value); q.set("page", String(target)); return `/admin/commercial/campaigns/results?${q}`; };
  return <div className="min-w-0 space-y-5"><AdminPageHeader eyebrow="Коммерческие инструменты" title="Результаты предложений" description="Операционное сравнение атрибуции. Не оценка причинного эффекта." />
    <Link className="text-sm text-emerald-800" href="/admin/commercial/campaigns">← Предложения</Link><CampaignResultsFilter query={query} />
    <CampaignResultsComparison summaries={summaries} />{!summaries.length ? <p>Предложения не найдены.</p> : null}
    <nav aria-label="Страницы результатов" className="flex flex-wrap gap-3 text-sm">{page > 1 ? <Link href={href(page - 1)}>Назад</Link> : null}<span>{page} / {Math.max(1, Math.ceil(campaigns.totalCount / 20))}</span>{page * 20 < campaigns.totalCount ? <Link href={href(page + 1)}>Далее</Link> : null}</nav>
  </div>;
}
