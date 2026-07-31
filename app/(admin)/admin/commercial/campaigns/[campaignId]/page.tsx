import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";
import { CampaignAdminActions } from "@/src/modules/commercial-campaigns/components";

export default async function AdminCampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const context = await requireAdminPagePermission("campaigns.view");
  const { campaignId } = await params;
  const detail = await createCommercialCampaignService().getAdmin(campaignId);
  if (!detail) notFound();
  const campaign = detail.campaign;
  const status = String(campaign.status ?? "");
  return <div className="space-y-6"><AdminPageHeader description={String(campaign.partner_description ?? "")} eyebrow={String(campaign.code ?? "Кампания")} title={String(campaign.name ?? "Коммерческая кампания")} /><CampaignAdminActions campaignId={campaignId} canPause={context.permissions.includes("campaigns.pause")} canPublish={context.permissions.includes("campaigns.publish")} status={status} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Object.entries({ Статус: status, Версия: campaign.current_version, Товаров: detail.items.length, Аудитория: detail.audience.filter((row) => row.included).length, Заказов: detail.analytics.orders }).map(([label,value]) => <div className="border border-zinc-200 bg-white p-4" key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{String(value)}</p></div>)}</section>
    <section><h2 className="text-lg font-semibold">Товары</h2><div className="mt-3 overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[680px] text-sm"><thead><tr><th className="p-3 text-left">SKU</th><th className="p-3 text-left">Товар</th><th className="p-3">Минимум</th><th className="p-3">Лимит компании</th><th className="p-3">Условие</th></tr></thead><tbody>{detail.items.map((item) => <tr className="border-t" key={String(item.id)}><td className="p-3">{String(item.sku)}</td><td className="p-3">{String(item.productName)}</td><td className="p-3 text-center">{String(item.minimum_quantity)}</td><td className="p-3 text-center">{item.maximum_quantity_per_company ? String(item.maximum_quantity_per_company) : "Нет"}</td><td className="p-3">Текущая цена</td></tr>)}</tbody></table></div></section>
    <section><h2 className="text-lg font-semibold">Аналитика</h2><p className="mt-2 text-sm text-zinc-600">Показы: {detail.analytics.impressions} · Открытия: {detail.analytics.opens} · Корзины: {detail.analytics.carts} · Заказы: {detail.analytics.orders} · Количество: {detail.analytics.attributedQuantity}. Атрибуция портальная и не доказывает причинность.</p></section>
  </div>;
}
