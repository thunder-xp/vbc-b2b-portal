import Link from "next/link";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";

export default async function AdminCampaignsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await requireAdminPagePermission("campaigns.view");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const result = await createCommercialCampaignService().listAdmin(page);
  return <div className="space-y-6"><AdminPageHeader description="Управляемые предложения с фиксированной аудиторией, сроком и неизменяемой версией публикации." eyebrow="Коммерческие данные" title="Коммерческие кампании" />
    {context.permissions.includes("campaigns.create") ? <Link className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" href="/admin/commercial/campaigns/new">Новая кампания</Link> : null}
    <div className="overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="p-3">Кампания</th><th className="p-3">Статус</th><th className="p-3">Период</th><th className="p-3">Товаров</th><th className="p-3">Аудитория</th></tr></thead><tbody>{result.items.map((campaign) => <tr className="border-t border-zinc-200" key={campaign.id}><td className="p-3"><Link className="font-semibold text-emerald-700" href={`/admin/commercial/campaigns/${campaign.id}`}>{campaign.name}</Link><p className="text-xs text-zinc-500">{campaign.code} · {campaign.partnerTitle}</p></td><td className="p-3">{statusLabel(campaign.status)}</td><td className="p-3">{date(campaign.startsAt)} — {date(campaign.endsAt)}</td><td className="p-3">{campaign.itemCount}</td><td className="p-3">{campaign.audienceCount}</td></tr>)}</tbody></table></div>
    {!result.items.length ? <p className="border border-dashed border-zinc-300 p-8 text-center">Кампаний пока нет.</p> : null}
  </div>;
}
function date(value: string) { return new Intl.DateTimeFormat("ru-RU").format(new Date(value)); }
function statusLabel(value: string) { return ({ draft: "Черновик", scheduled: "Запланирована", active: "Активна", paused: "Приостановлена", completed: "Завершена", archived: "Архив" } as Record<string,string>)[value] ?? value; }
