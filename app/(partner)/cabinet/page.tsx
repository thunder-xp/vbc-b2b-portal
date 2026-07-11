import { redirect } from "next/navigation";

import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions";
import {
  QuickActions,
  StatusBadge,
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHero,
} from "@/src/modules/partner-cabinet/components";

export default async function CabinetPage() {
  const result = await getWorkspaceHomeAction();
  if (!result.success && result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
  if (!result.success) {
    return <WorkspaceEmptyState actionLabel="Обновить страницу" message="Не удалось загрузить данные рабочего пространства. Попробуйте ещё раз позже." title="Данные временно недоступны" />;
  }

  const workspace = result.data;
  return (
    <div className="space-y-6">
      <WorkspaceHero workspace={workspace} />

      {workspace.commercialConfigurationMissing && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          Коммерческие условия компании ещё не настроены. Обратитесь к менеджеру Novotech.
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkspaceCard actionHref="/cabinet/catalog" actionLabel="Проверить остатки" title="Точные остатки">
          <div className="space-y-3">
            <StatusBadge label={workspace.inventory.isSynchronized ? "Остатки синхронизированы" : "Проверьте наличие в каталоге"} tone={workspace.inventory.isSynchronized ? "green" : "amber"} />
            <p className="text-sm text-zinc-600">Наличие товаров, складские остатки и ожидаемые поступления.</p>
            <p className="text-sm text-zinc-600">Последнее обновление: {workspace.inventory.lastSynchronization}</p>
          </div>
        </WorkspaceCard>
        <WorkspaceCard actionHref="/cabinet/catalog" actionLabel="Посмотреть свои цены" title="Персональные цены">
          <div className="space-y-3">
            <StatusBadge label={workspace.pricing.isActive ? "Партнёрские цены активны" : "Требуется настройка"} tone={workspace.pricing.isActive ? "green" : "amber"} />
            <p className="text-sm text-zinc-600">Вид цены: <span className="font-medium text-zinc-950">{workspace.pricing.priceType}</span></p>
            <p className="text-sm text-zinc-600">{workspace.pricing.lastUpdate}</p>
          </div>
        </WorkspaceCard>
        <WorkspaceCard actionHref="/cabinet/company" actionLabel="Открыть компанию" title="Моя компания">
          <div className="space-y-2 text-sm text-zinc-600">
            <p className="font-medium text-zinc-950">{workspace.company.name}</p>
            <p>Роль: {workspace.company.role}</p>
            <p>Код компании в 1С: {workspace.company.external1cCode}</p>
          </div>
        </WorkspaceCard>
      </div>

      <QuickActions modules={workspace.modules} />
    </div>
  );
}
