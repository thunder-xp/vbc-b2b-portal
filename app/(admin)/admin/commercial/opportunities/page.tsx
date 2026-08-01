import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { getCommercialOpportunityDiagnosticsAction } from "@/src/modules/commercial-opportunities/actions";

export default async function AdminCommercialOpportunitiesPage() {
  await requireAdminPagePermission("admin.opportunities.view");
  const diagnostics = await getCommercialOpportunityDiagnosticsAction();
  const byType = record(diagnostics.byType);
  const lastRun = record(diagnostics.lastRun);
  return <div className="space-y-6">
    <AdminPageHeader description="Безопасные агрегаты детерминированной проекции. Коммерческие значения и рекомендации отдельных партнёров не раскрываются." eyebrow="Коммерческие данные" title="Возможности для закупки" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Активные" value={numeric(diagnostics.active)} /><Metric label="Завершённые" value={numeric(diagnostics.resolved)} /><Metric label="Истёкшие" value={numeric(diagnostics.expired)} /><Metric label="Скрытые пользователями" value={numeric(diagnostics.dismissed)} /><Metric label="Компании с возможностями" value={numeric(diagnostics.affectedCompanies)} /><Metric label="Компании в очереди" value={numeric(diagnostics.dirtyCompanies)} /><Metric label="Последний пакет, мс" value={numeric(lastRun.duration_ms)} /><Metric label="Ошибки последнего пакета" value={numeric(lastRun.failures)} /></div>
    <section><h2 className="mb-3 font-semibold text-zinc-950">По типам</h2><div className="overflow-x-auto border border-zinc-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-zinc-50 text-left text-xs text-zinc-500"><tr><th className="px-3 py-2">Тип</th><th className="px-3 py-2">Количество</th></tr></thead><tbody className="divide-y divide-zinc-100">{Object.entries(byType).map(([type, count]) => <tr key={type}><td className="px-3 py-2">{typeLabel(type)}</td><td className="px-3 py-2 font-semibold">{numeric(count)}</td></tr>)}</tbody></table></div></section>
    <p className="text-xs text-zinc-500">Старейший необработанный ключ: {typeof diagnostics.oldestDirtyAt === "string" ? new Date(diagnostics.oldestDirtyAt).toLocaleString("ru-RU") : "очередь пуста"}.</p>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="border border-zinc-200 bg-white p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p></div>; }
function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numeric(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function typeLabel(type: string): string { return ({ repeat_purchase_available: "Повторная закупка", watched_product_back_in_stock: "Снова в наличии", relevant_product_arrival_confirmed: "Подтверждённое поступление", relevant_product_price_decreased: "Цена стала ниже", purchase_template_ready: "Готовый шаблон", previous_order_repeatable: "Повтор заказа", relevant_merchandising_offer: "Предложение Novotech", relevant_product_low_stock: "Низкий остаток", source_product_low_stock_with_available_analog: "Доступен аналог" } as Record<string, string>)[type] ?? type; }
