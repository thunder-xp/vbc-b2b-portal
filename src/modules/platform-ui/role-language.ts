const roleLabels: Record<string, string> = {
  partner_owner: "Владелец",
  partner_manager: "Менеджер",
  partner_buyer: "Покупатель",
  partner_accounting: "Бухгалтер",
  partner_viewer: "Наблюдатель",
};

const roleDescriptions: Record<string, string> = {
  partner_owner: "Полное управление компанией и сотрудниками.",
  partner_manager: "Заказы, каталог и операционная работа.",
  partner_buyer: "Каталог, корзина и заказы.",
  partner_accounting: "Финансовые данные компании.",
  partner_viewer: "Просмотр доступных данных без управления.",
};

export function getPartnerRoleLabel(code: string): string {
  return roleLabels[code] ?? "Роль уточняется";
}

export function getPartnerRoleDescription(code: string): string {
  return roleDescriptions[code] ?? "Права зависят от настроек компании.";
}
