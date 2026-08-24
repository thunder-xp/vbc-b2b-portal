import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { CompetitiveIntelligenceRepository, type CompetitiveWindowDays } from "@/src/modules/competitive-intelligence";
import { AdminMarketIntelligence } from "@/src/modules/competitive-intelligence/components/AdminMarketIntelligence";

export default async function MarketIntelligencePage({ searchParams }: { searchParams?: Promise<{ window?: string }> }) {
  const [context, params] = await Promise.all([requireAdminPagePermission("admin.analytics.view"), searchParams]);
  const windowDays = parseWindow(params?.window);
  const data = await new CompetitiveIntelligenceRepository().getAdminDashboard(windowDays);
  return <main className="space-y-6"><AdminPageHeader eyebrow="Коммерческие данные" title="Рыночная аналитика" description="Агрегированная конкурентная информация из портальных наблюдений. Рекомендации носят консультативный характер и не изменяют цены Novotech." /><AdminMarketIntelligence canManage={context.permissions.includes("admin.market_intelligence.manage")} data={data} windowDays={windowDays} /></main>;
}
function parseWindow(value: string | undefined): CompetitiveWindowDays { return value === "7" ? 7 : value === "90" ? 90 : value === "36500" ? 36500 : 30; }
