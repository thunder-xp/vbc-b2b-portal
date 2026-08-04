import type {
  AdminNavigationGroup,
  AdminNavigationItem,
} from "../types";

export const ADMIN_NAVIGATION: readonly AdminNavigationGroup[] = [
  {
    label: "Обзор",
    items: [
      { label: "Рабочий стол", href: "/admin", permission: "admin.dashboard.view" },
      {
        label: "Состояние платформы",
        href: "/admin/platform-health",
        permission: "admin.platform_health.view",
      },
    ],
  },
  {
    label: "Партнёры",
    items: [
      { label: "Компании", href: "/admin/companies", permission: "admin.companies.view" },
      { label: "Пользователи", href: "/admin/users", permission: "admin.users.view" },
      { label: "Приглашения", href: "/admin/invitations", permission: "admin.invitations.view" },
      {
        label: "Онбординг партнёров",
        href: "/admin/onboarding",
        permission: "onboarding.requests.view",
      },
      { label: "Проверка прав", href: "/admin/access", permission: "admin.security.view" },
    ],
  },
  {
    label: "Коммерческие данные",
    items: [
      { label: "Каталог", href: "/admin/commercial/catalog", permission: "admin.catalog.view" },
      {
        label: "Витрина каталога",
        href: "/admin/commercial/merchandising",
        permission: "admin.catalog.view",
      },
      {
        label: "Аналитика спроса",
        href: "/admin/commercial/analytics",
        permission: "admin.analytics.view",
      },
      {
        label: "Возможности для закупки",
        href: "/admin/commercial/opportunities",
        permission: "admin.opportunities.view",
      },
      {
        label: "Коммерческие кампании",
        href: "/admin/commercial/campaigns",
        permission: "campaigns.view",
      },
      {
        label: "Динамика партнёров",
        href: "/admin/commercial/partner-momentum",
        permission: "partner_momentum.view_assigned",
      },
      { label: "Цены", href: "/admin/commercial/prices", permission: "admin.prices.view" },
      { label: "Остатки", href: "/admin/commercial/stock", permission: "admin.stock.view" },
      {
        label: "Ожидаемые поступления",
        href: "/admin/commercial/arrivals",
        permission: "admin.stock.view",
      },
      {
        label: "Коммерческие курсы",
        href: "/admin/commercial/rates",
        permission: "admin.rates.view",
      },
    ],
  },
  {
    label: "Интеграции",
    items: [
      {
        label: "Центр синхронизации",
        href: "/admin/integrations",
        permission: "admin.integrations.view",
      },
      {
        label: "История заданий",
        href: "/admin/integrations/jobs",
        permission: "admin.integrations.view",
      },
      {
        label: "Состояние 1С",
        href: "/admin/integrations/1c-health",
        permission: "admin.integrations.view",
      },
      {
        label: "Уведомления",
        href: "/admin/integrations/notifications",
        permission: "admin.integrations.view",
      },
      {
        label: "Документы",
        href: "/admin/integrations/documents",
        permission: "admin.documents.view",
      },
      {
        label: "Инциденты",
        href: "/admin/integrations/incidents",
        permission: "admin.integrations.view",
      },
      { label: "Сервис 1С", href: "/admin/integrations/service", permission: "admin.service.view" },
      { label: "Диагностика IT-поддержки", href: "/admin/integrations/support", permission: "support.diagnostics.view" },
      { label: "Диагностика базы знаний", href: "/admin/integrations/knowledge", permission: "knowledge.analytics.view" },
    ],
  },
  {
    label: "Операции",
    items: [
      { label: "Заказы", href: "/admin/orders", permission: "admin.orders.view" },
      { label: "Сервис", href: "/admin/service", permission: "admin.service.view" },
      { label: "IT-поддержка", href: "/admin/support", permission: "support.view_all" },
      { label: "База знаний", href: "/admin/knowledge", permission: "knowledge.edit" },
      {
        label: "Планируемые отгрузки",
        href: "/admin/planned-shipments",
        permission: "admin.shipments.view",
      },
      {
        label: "Переносы дат",
        href: "/admin/date-change-requests",
        permission: "order_date_changes.review",
      },
      { label: "Резервы", href: "/admin/reservations", permission: "reservations.review" },
      {
        label: "Спецификации",
        href: "/admin/specifications",
        permission: "specifications.review",
      },
      { label: "Сметы и КП", href: "/admin/estimates", permission: "admin.estimates.view" },
      { label: "Документы", href: "/admin/documents", permission: "admin.documents.view" },
    ],
  },
  {
    label: "Финансы",
    items: [
      {
        label: "Балансы по договорам",
        href: "/admin/finance",
        permission: "admin.finance.view",
      },
    ],
  },
  {
    label: "Безопасность",
    items: [
      { label: "Журнал аудита", href: "/admin/audit", permission: "admin.audit.view" },
      {
        label: "Центр безопасности",
        href: "/admin/security",
        permission: "admin.security.view",
      },
    ],
  },
  {
    label: "Настройки",
    items: [
      {
        label: "Роли и разрешения",
        href: "/admin/settings",
        permission: "admin.settings.view",
      },
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
        (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)),
    )
    .sort((left, right) => right.href.length - left.href.length);
  return candidates[0] ?? null;
}
