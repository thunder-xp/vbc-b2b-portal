import { AdminPageHeader, requireAdminPagePermission } from "@/src/modules/admin";
import { createAccessRiskService } from "@/src/modules/access-risk";
import { AccessRiskOverviewView } from "@/src/modules/access-risk/components";

export default async function AdminAccessRiskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPagePermission("admin.security.view");
  const params = await searchParams;
  const filters = {
    query: scalar(params.q).slice(0, 100),
    riskState: allowed(scalar(params.risk), ["HIGH","ELEVATED","LOW","LEARNING"]),
    mode: allowed(scalar(params.mode), ["NORMAL","ENHANCED"]),
    sort: allowed(scalar(params.sort), ["risk_desc","activity_desc","company_asc"]) || "risk_desc",
    page: Math.max(1, Math.min(10_000, Number.parseInt(scalar(params.page), 10) || 1)),
  };
  const data = await createAccessRiskService().getOverview({ ...filters, pageSize: 25 });
  return <div className="space-y-6"><AdminPageHeader eyebrow="Безопасность" title="Мониторинг рисков доступа" description="Объяснимые агрегированные сигналы для партнёрских компаний. Наблюдение не блокирует доступ и не меняет коммерческие права."/><AccessRiskOverviewView data={data} filters={filters}/></div>;
}

function scalar(value:string|string[]|undefined){return typeof value==="string"?value:"";}
function allowed(value:string, values:string[]){return values.includes(value)?value:"";}
