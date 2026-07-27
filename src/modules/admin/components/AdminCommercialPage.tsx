import { AdminCommercialSummaryView } from "./AdminCommercialSummary";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  createAdminOperationsService,
  requireAdminPagePermission,
} from "../services";

const CONFIG = {
  catalog: {
    permission: "admin.catalog.view",
    title: "Каталог",
    description: "Публикация товаров и безопасные показатели качества каталога.",
  },
  prices: {
    permission: "admin.prices.view",
    title: "Цены",
    description: "Состояние опубликованных цен и валют без раскрытия прайс-листов.",
  },
  stock: {
    permission: "admin.stock.view",
    title: "Остатки",
    description: "Агрегированное состояние складского read-моделя.",
  },
  arrivals: {
    permission: "admin.stock.view",
    title: "Ожидаемые поступления",
    description: "Опубликованные ближайшие поступления и их свежесть.",
  },
} as const;

export async function AdminCommercialPage({
  domain,
  search,
}: {
  domain: keyof typeof CONFIG;
  search?: string;
}) {
  const config = CONFIG[domain];
  await requireAdminPagePermission(config.permission);
  const summary = await createAdminOperationsService().getCommercialSummary(
    domain,
    search,
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={config.description}
        eyebrow="Коммерческие данные"
        title={config.title}
      />
      <AdminCommercialSummaryView summary={summary} />
    </div>
  );
}
