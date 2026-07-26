import type {
  AdminNavigationGroup,
  AdminNavigationItem,
} from "../types";

const NAVIGATION: readonly AdminNavigationGroup[] = [
  {
    label: "Обзор",
    items: [
      {
        label: "Рабочий стол",
        href: "/admin",
        permission: "admin.dashboard.view",
      },
    ],
  },
  {
    label: "Партнёры",
    items: [
      {
        label: "Компании",
        href: "/admin/companies",
        permission: "admin.companies.view",
      },
      {
        label: "Пользователи",
        href: "/admin/users",
        permission: "admin.users.view",
      },
      {
        label: "Приглашения",
        href: "/admin/invitations",
        permission: "admin.invitations.view",
      },
      {
        label: "Заявки на доступ",
        href: "/admin/partner-requests",
        permission: "admin.access_requests.view",
      },
    ],
  },
  {
    label: "Коммерческие данные",
    items: [
      {
        label: "Каталог и синхронизация",
        href: "/admin/integrations/catalog-sync",
        permission: "admin.catalog.view",
      },
      {
        label: "Курсы",
        href: "/admin/commercial-rates",
        permission: "admin.rates.view",
      },
    ],
  },
  {
    label: "Интеграции",
    items: [
      {
        label: "Диагностика 1С",
        href: "/admin/integrations/1c-health",
        permission: "admin.integrations.view",
      },
    ],
  },
  {
    label: "Безопасность",
    items: [
      {
        label: "Инспектор доступа",
        href: "/admin/access",
        permission: "admin.security.view",
      },
    ],
  },
  {
    label: "Операции",
    items: [
      {
        label: "Переносы дат",
        href: "/admin/reservation-requests",
        permission: "order_date_changes.review",
      },
      {
        label: "Спецификации",
        href: "/admin/specifications",
        permission: "specifications.review",
      },
    ],
  },
];

export function buildAdminNavigation(
  permissions: readonly string[],
): readonly AdminNavigationGroup[] {
  const allowed = new Set(permissions);

  return NAVIGATION.map((group) => ({
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
