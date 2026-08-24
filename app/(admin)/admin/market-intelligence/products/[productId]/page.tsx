import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { CompetitiveIntelligenceRepository, type CompetitiveWindowDays } from "@/src/modules/competitive-intelligence";
import { AdminProductMarketProfile } from "@/src/modules/competitive-intelligence/components/AdminMarketIntelligence";

export default async function ProductMarketProfilePage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams?: Promise<{ window?: string }> }) {
  const context = await requireAdminPagePermission("admin.analytics.view");
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const data = await new CompetitiveIntelligenceRepository().getProductProfile(productId, parseWindow(query?.window));
  return <main className="space-y-6"><AdminPageHeader eyebrow="Рыночная аналитика" title={`${data.sku} · ${data.name}`} description="Медианы, тренды, объём наблюдений и детерминированные сигналы по товару." /><AdminProductMarketProfile canManage={context.permissions.includes("admin.market_intelligence.manage")} data={data} /></main>;
}

function parseWindow(value: string | undefined): CompetitiveWindowDays { return value === "7" ? 7 : value === "90" ? 90 : value === "36500" ? 36500 : 30; }
