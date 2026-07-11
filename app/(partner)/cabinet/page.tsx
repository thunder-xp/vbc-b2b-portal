import { redirect } from "next/navigation";

import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions";
import {
  QuickActions,
  RecentActivity,
  StatusBadge,
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHero,
  WorkspaceMetric,
  WorkspaceOperationalSummary,
} from "@/src/modules/partner-cabinet/components";

export default async function CabinetPage() {
  const result = await getWorkspaceHomeAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) {
    return <WorkspaceEmptyState actionLabel="Проверить статус доступа" message="Рабочее пространство пока недоступно." title="Доступ не готов" />;
  }

  const workspace = result.data;
  return (
    <div className="space-y-6">
      <WorkspaceHero workspace={workspace} />

      {workspace.commercialConfigurationMissing && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          Коммерческие условия компании ещё не настроены. Обратитесь к вашему менеджеру.
        </section>
      )}

      <WorkspaceOperationalSummary operational={workspace.operational} />

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkspaceCard actionHref="/cabinet/catalog" actionLabel="Открыть каталог" title="Каталог">
          <dl className="grid grid-cols-3 gap-4">
            <WorkspaceMetric label="Товары" value={workspace.catalog.totalProductsLabel} />
            <WorkspaceMetric label="Бренды" value={workspace.catalog.brands} />
            <WorkspaceMetric label="Категории" value={workspace.catalog.categories} />
          </dl>
        </WorkspaceCard>
        <WorkspaceCard title="Цены">
          <div className="space-y-3">
            <StatusBadge label={workspace.pricing.isActive ? "Партнёрские цены активны" : "Требуется настройка"} tone={workspace.pricing.isActive ? "green" : "amber"} />
            <p className="text-sm text-zinc-600">Вид цены: <span className="font-medium text-zinc-950">{workspace.pricing.priceType}</span></p>
            <p className="text-sm text-zinc-600">{workspace.pricing.lastUpdate}</p>
          </div>
        </WorkspaceCard>
        <WorkspaceCard title="Остатки">
          <div className="space-y-3">
            <StatusBadge label={workspace.inventory.isSynchronized ? "Синхронизировано" : "Нет данных"} tone={workspace.inventory.isSynchronized ? "green" : "amber"} />
            <p className="text-sm text-zinc-600">Последнее обновление: {workspace.inventory.lastSynchronization}</p>
          </div>
        </WorkspaceCard>
      </div>

      <QuickActions modules={workspace.modules} />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <RecentActivity activity={workspace.activity} />
        <section className="grid gap-4">
          <WorkspaceEmptyState actionLabel="Модуль заказов появится здесь" message="Активных заказов пока нет." title="Заказы" />
          <WorkspaceEmptyState actionLabel="Модуль документов появится здесь" message="Документов, требующих внимания, пока нет." title="Документы" />
        </section>
      </div>
    </div>
  );
}
