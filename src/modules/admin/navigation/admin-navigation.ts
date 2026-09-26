import type { AdminNavigationGroup, AdminNavigationItem } from "../types";

export const ADMIN_NAVIGATION: readonly AdminNavigationGroup[] = [
  {
    label: "Обзор",
    tier: "primary",
    items: [
      { label: "Рабочий стол", href: "/admin", permission: "admin.dashboard.view" },
    ],
  },
  {
    label: "Партнёры",
    tier: "primary",
    items: [
      { label: "Партнёры", href: "/admin/companies", permission: "admin.companies.view" },
      { label: "Пользователи", href: "/admin/users", permission: "admin.users.view" },
      { label: "Агенты", href: "/admin/agents", permission: "admin.agents.view" },
    ],
  },
  {
    label: "Продажи",
    tier: "primary",
    items: [
      { label: "Заказы", href: "/admin/orders", permission: "admin.orders.view" },
      { label: "Сметы и КП", href: "/admin/estimates", permission: "admin.estimates.view" },
      { label: "Коммерческие запросы", href: "/admin/commercial/opportunities", permission: "admin.opportunities.view" },
    ],
  },
  {
    label: "Операции",
    tier: "primary",
    items: [
      { label: "Сервис", href: "/admin/service", permission: "admin.service.view" },
      { label: "Монтаж", href: "/admin/retail/installation", permission: "admin.retail_marketplace.view" },
    ],
  },
  {
    label: "Финансы",
    tier: "primary",
    items: [
      { label: "Балансы по договорам", href: "/admin/finance", permission: "admin.finance.view" },
    ],
  },
  {
    label: "Управление партнёрами",
    tier: "secondary",
    items: [
      { label: "Публичный каталог партнёров", href: "/admin/partners/public-directory", permission: "admin.catalog.manage" },
      { label: "Приглашения", href: "/admin/invitations", permission: "admin.invitations.view" },
      { label: "Онбординг партнёров", href: "/admin/onboarding", permission: "onboarding.requests.view" },
      { label: "Проверка прав", href: "/admin/access", permission: "admin.security.view" },
    ],
  },
  {
    label: "Каталог и контент",
    tier: "secondary",
    items: [
      { label: "Управление каталогом", href: "/admin/catalog", permission: "admin.catalog.view" },
      { label: "Локализация каталога", href: "/admin/content/localization", permission: "admin.catalog.view" },
      { label: "Публичный блог", href: "/admin/content/blog", permission: "admin.catalog.manage" },
      { label: "Видео для партнёров", href: "/admin/content/partner-videos", permission: "content.manage" },
    ],
  },
  {
    label: "Коммерческие инструменты",
    tier: "secondary",
    items: [
      { label: "Аналитика спроса", href: "/admin/commercial/analytics", permission: "admin.analytics.view" },
      { label: "Прайс-листы конкурентов", href: "/admin/market-intelligence/price-lists", permission: "admin.analytics.view" },
      { label: "Рыночная аналитика", href: "/admin/market-intelligence", permission: "admin.analytics.view" },
      { label: "Неудовлетворённый спрос", href: "/admin/commercial/unmet-demand", permission: "admin.external_demand.view" },
      { label: "Номенклатура партнёров", href: "/admin/commercial/nomenclature", permission: "admin.external_nomenclature.view" },
      { label: "Генератор КП", href: "/admin/commercial/proposal-generator", permission: "admin.estimates.view" },
      { label: "Коммерческие кампании", href: "/admin/commercial/campaigns", permission: "campaigns.view" },
      { label: "Динамика партнёров", href: "/admin/commercial/partner-momentum", permission: "partner_momentum.view_assigned" },
      { label: "Цены", href: "/admin/commercial/prices", permission: "admin.prices.view" },
      { label: "Остатки", href: "/admin/commercial/stock", permission: "admin.stock.view" },
      { label: "Ожидаемые поступления", href: "/admin/commercial/arrivals", permission: "admin.stock.view" },
      { label: "Коммерческие курсы", href: "/admin/commercial/rates", permission: "admin.rates.view" },
    ],
  },
  {
    label: "Интеграции и диагностика",
    tier: "secondary",
    items: [
      { label: "Состояние платформы", href: "/admin/platform-health", permission: "admin.platform_health.view" },
      { label: "Центр синхронизации", href: "/admin/integrations", permission: "admin.integrations.view" },
      { label: "История заданий", href: "/admin/integrations/jobs", permission: "admin.integrations.view" },
      { label: "Состояние 1С", href: "/admin/integrations/1c-health", permission: "admin.integrations.view" },
      { label: "Уведомления", href: "/admin/integrations/notifications", permission: "admin.integrations.view" },
      { label: "Документы интеграции", href: "/admin/integrations/documents", permission: "admin.documents.view" },
      { label: "Инциденты", href: "/admin/integrations/incidents", permission: "admin.integrations.view" },
      { label: "Сервис 1С", href: "/admin/integrations/service", permission: "admin.service.view" },
      { label: "Серийные номера", href: "/admin/integrations/warranty-serials", permission: "admin.integrations.warranty_serials.view" },
      { label: "Диагностика IT-поддержки", href: "/admin/integrations/support", permission: "support.diagnostics.view" },
      { label: "Диагностика базы знаний", href: "/admin/integrations/knowledge", permission: "knowledge.analytics.view" },
    ],
  },
  {
    label: "Операционные инструменты",
    tier: "secondary",
    items: [
      { label: "Обращения частных клиентов", href: "/admin/service/customers", permission: "admin.service.view" },
      { label: "Проверка серийного номера", href: "/admin/service/serial-verification", permission: "admin.service.serial.verify" },
      { label: "IT-поддержка", href: "/admin/support", permission: "support.view_all" },
      { label: "База знаний", href: "/admin/knowledge", permission: "knowledge.edit" },
      { label: "Планируемые отгрузки", href: "/admin/planned-shipments", permission: "admin.shipments.view" },
      { label: "Переносы дат", href: "/admin/date-change-requests", permission: "order_date_changes.review" },
      { label: "Резервы", href: "/admin/reservations", permission: "reservations.review" },
      { label: "Спецификации", href: "/admin/specifications", permission: "specifications.review" },
      { label: "Документы", href: "/admin/documents", permission: "admin.documents.view" },
    ],
  },
  {
    label: "Безопасность и настройки",
    tier: "secondary",
    items: [
      { label: "Журнал аудита", href: "/admin/audit", permission: "admin.audit.view" },
      { label: "Центр безопасности", href: "/admin/security", permission: "admin.security.view" },
      { label: "Мониторинг рисков", href: "/admin/security/access-risk", permission: "admin.security.view" },
      { label: "Роли и разрешения", href: "/admin/settings", permission: "admin.settings.view" },
    ],
  },
];

export function buildAdminNavigation(
  permissions: readonly string[],
): readonly AdminNavigationGroup[] {
  const allowed = new Set(permissions);
  return ADMIN_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function findAdminNavigationItem(
  navigation: readonly AdminNavigationGroup[],
  pathname: string,
): AdminNavigationItem | null {
  const candidates = navigation
    .flatMap((group) => group.items)
    .filter(
      (item) =>
        pathname === item.href ||
        (item.href !== "/admin" && pathname.startsWith(item.href + "/")),
    )
    .sort((left, right) => right.href.length - left.href.length);
  return candidates[0] ?? null;
}
