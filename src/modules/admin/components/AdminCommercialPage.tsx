import { AdminCommercialSummaryView } from "./AdminCommercialSummary";
import { AdminRetailPriceHistoryHealthView } from "./AdminRetailPriceHistoryHealth";
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
  const service = createAdminOperationsService();
  const [summary, retailHistoryHealth] = await Promise.all([
    service.getCommercialSummary(domain, search),
    domain === "prices"
      ? service.getRetailPriceHistoryHealth()
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={config.description}
        eyebrow="Коммерческие данные"
        title={config.title}
      />
      <AdminCommercialSummaryView summary={summary} />
      {retailHistoryHealth ? <AdminRetailPriceHistoryHealthView health={retailHistoryHealth} /> : null}
    </div>
  );
}
