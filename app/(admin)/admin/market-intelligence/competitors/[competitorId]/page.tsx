import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { CompetitiveIntelligenceRepository, type CompetitiveWindowDays } from "@/src/modules/competitive-intelligence";
import { AdminCompetitorProfile } from "@/src/modules/competitive-intelligence/components/AdminMarketIntelligence";

export default async function CompetitorProfilePage({ params, searchParams }: { params: Promise<{ competitorId: string }>; searchParams?: Promise<{ window?: string }> }) {
  await requireAdminPagePermission("admin.analytics.view");
  const [{ competitorId }, query] = await Promise.all([params, searchParams]);
  const data = await new CompetitiveIntelligenceRepository().getCompetitorProfile(competitorId, parseWindow(query?.window));
  return <main className="space-y-6"><AdminPageHeader eyebrow="Рыночная аналитика" title={data.name} description="Фактическая позиция конкурента по сопоставимым когортам без стратегических предположений." /><AdminCompetitorProfile data={data} /></main>;
}

function parseWindow(value: string | undefined): CompetitiveWindowDays { return value === "7" ? 7 : value === "90" ? 90 : value === "36500" ? 36500 : 30; }
