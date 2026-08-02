import { AdminCommercialSummaryView } from "./AdminCommercialSummary";
import { AdminCommercialIntegrityView } from "./AdminCommercialIntegrity";
import { AdminRetailPriceHistoryHealthView } from "./AdminRetailPriceHistoryHealth";
import { AdminRetailPriceHistoryBackfill } from "./AdminRetailPriceHistoryBackfill";
import { AdminRetailHistoryAbsenceDiagnostic } from "./AdminRetailHistoryAbsenceDiagnostic";
import { AdminPageHeader } from "./AdminPageHeader";
import {
  createAdminOperationsService,
  requireAdminPagePermission,
} from "../services";
import type { AdminRetailHistoryAbsenceFilters } from "../types";

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
  retailHistoryAbsenceFilters,
  search,
}: {
  domain: keyof typeof CONFIG;
  retailHistoryAbsenceFilters?: AdminRetailHistoryAbsenceFilters;
  search?: string;
}) {
  const config = CONFIG[domain];
  await requireAdminPagePermission(config.permission);
  const service = createAdminOperationsService();
  const [summary, retailHistoryHealth, retailHistoryAbsence, commercialIntegrity] = await Promise.all([
    service.getCommercialSummary(domain, search),
    domain === "prices"
      ? service.getRetailPriceHistoryHealth()
      : Promise.resolve(null),
    domain === "prices"
      ? service.listProductsWithoutRetailHistory(retailHistoryAbsenceFilters ?? {})
      : Promise.resolve(null),
    domain === "stock"
      ? service.getCommercialIntegrity()
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
      {commercialIntegrity ? <AdminCommercialIntegrityView integrity={commercialIntegrity} /> : null}
      {retailHistoryHealth ? <AdminRetailPriceHistoryHealthView health={retailHistoryHealth} /> : null}
      {retailHistoryHealth ? <AdminRetailPriceHistoryBackfill health={retailHistoryHealth} /> : null}
      {retailHistoryAbsence ? (
        <AdminRetailHistoryAbsenceDiagnostic
          filters={retailHistoryAbsenceFilters ?? {}}
          result={retailHistoryAbsence}
        />
      ) : null}
    </div>
  );
}
