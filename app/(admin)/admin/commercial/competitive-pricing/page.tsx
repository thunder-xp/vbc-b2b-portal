import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { ExternalPriceRepository } from "@/src/modules/external-prices";
import { CommercialIntelligenceRepository, CompetitiveIntelligenceTables } from "@/src/modules/commercial-intelligence";

type SourceSummary={sourceId:string;sourceName:string;latestObservationDate:string|null;contributingCompanies:number;matchedProducts:number;observationCount:number};
export default async function CompetitivePricingPage(){
  await requireAdminPagePermission("admin.analytics.view");
  const [summary,intelligence]=await Promise.all([
    new ExternalPriceRepository().adminSummary(),
    new CommercialIntelligenceRepository().getDashboard(),
  ]);
  const sources=Array.isArray(summary.sources)?summary.sources as SourceSummary[]:[];
  return <main className="space-y-6"><AdminPageHeader eyebrow="Коммерческие данные" title="Конкурентные цены" description="Агрегированная оценка загруженных партнёрами внешних цен. Источники файлов и компании доступны только для внутренней диагностики."/>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Текущих внешних цен" value={number(summary.currentPriceCount)}/><Metric label="Конкурент дешевле" value={number(summary.competitorCheaperCount)}/><Metric label="Novotech дешевле" value={number(summary.novotechCheaperCount)}/><Metric label="Паритет" value={number(summary.parityCount)}/></section>
    <section><h2 className="text-base font-semibold">Источники</h2><div className="mt-3 overflow-x-auto border border-zinc-200"><table className="min-w-full text-sm"><thead className="bg-zinc-50 text-left text-xs text-zinc-600"><tr><th className="px-3 py-2">Источник</th><th className="px-3 py-2">Последнее наблюдение</th><th className="px-3 py-2">Компании</th><th className="px-3 py-2">Товары</th><th className="px-3 py-2">Наблюдения</th></tr></thead><tbody className="divide-y divide-zinc-100">{sources.map(source=><tr key={source.sourceId}><td className="px-3 py-3 font-semibold">{source.sourceName}</td><td className="px-3 py-3">{source.latestObservationDate??"—"}</td><td className="px-3 py-3">{source.contributingCompanies}</td><td className="px-3 py-3">{source.matchedProducts}</td><td className="px-3 py-3">{source.observationCount}</td></tr>)}</tbody></table></div></section>
    <CompetitiveIntelligenceTables data={intelligence}/>
  </main>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;}
function number(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
