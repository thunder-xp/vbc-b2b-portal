import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { AdminCompetitorRetailImportForm } from "@/src/modules/competitive-intelligence/components/AdminCompetitorRetailImportForm";
import { CompetitorRetailPricingRepository } from "@/src/modules/competitive-intelligence/retail-pricing.repository";

export default async function CompetitorRetailPriceListsPage() {
  const context = await requireAdminPagePermission("admin.analytics.view");
  const data = await new CompetitorRetailPricingRepository().listImports();
  const canManage = context.permissions.includes("admin.market_intelligence.manage");
  return <main className="space-y-7"><AdminPageHeader eyebrow="Рыночная аналитика" title="Прайс-листы конкурентов" description="Централизованный импорт retail/list цен конкурентов. НДС включён; индивидуальные цены партнёров хранятся отдельно." />
    {canManage ? <section aria-labelledby="competitor-retail-upload"><h2 className="text-base font-semibold" id="competitor-retail-upload">Новый импорт</h2><AdminCompetitorRetailImportForm competitors={data.competitors} /></section> : null}
    <section aria-labelledby="competitor-retail-history"><h2 className="text-base font-semibold" id="competitor-retail-history">История импортов</h2>{data.imports.length ? <div className="mt-3 overflow-x-auto border border-zinc-200"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-zinc-50 text-xs text-zinc-600"><tr><th className="px-3 py-2">Конкурент</th><th className="px-3 py-2">Файл / дата</th><th className="px-3 py-2">Статус</th><th className="px-3 py-2 text-right">Строки</th><th className="px-3 py-2 text-right">Сопоставлено</th><th className="px-3 py-2 text-right">Без соответствия</th><th className="px-3 py-2 text-right">Изменено</th></tr></thead><tbody className="divide-y divide-zinc-100">{data.imports.map((item) => <tr key={item.id}><td className="px-3 py-3 font-semibold">{item.competitorName}</td><td className="px-3 py-3"><Link className="font-medium text-emerald-800 hover:underline" href={`/admin/market-intelligence/price-lists/${item.id}`}>{item.fileName}</Link><span className="block text-xs text-zinc-500">{item.effectiveDate} · {item.currency}</span></td><td className="px-3 py-3">{status(item.status)}</td><td className="px-3 py-3 text-right">{item.rows}</td><td className="px-3 py-3 text-right">{item.mapped}</td><td className="px-3 py-3 text-right">{item.unmapped}</td><td className="px-3 py-3 text-right">{item.changed}</td></tr>)}</tbody></table></div> : <p className="mt-3 border-y border-zinc-200 py-6 text-sm text-zinc-500">Импортов пока нет.</p>}</section>
  </main>;
}

function status(value: string) { return ({ uploaded: "В очереди", analyzing: "Анализ", mapping_required: "Нужны колонки", ready_for_review: "На проверке", applied: "Применён", failed: "Ошибка", archived: "Архив" } as Record<string, string>)[value] ?? value; }
