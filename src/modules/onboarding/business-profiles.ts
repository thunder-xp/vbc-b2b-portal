export const ONBOARDING_BUSINESS_PROFILE_CODES = [
  "owner",
  "manager",
  "buyer",
  "accounting",
  "retail_only",
] as const;

export type OnboardingBusinessProfileCode =
  (typeof ONBOARDING_BUSINESS_PROFILE_CODES)[number];

export type OnboardingBusinessProfile = {
  code: OnboardingBusinessProfileCode;
  label: string;
  roleCode: string;
  partnerPrices: boolean;
  catalog: boolean;
  orders: boolean;
  finance: boolean | "optional";
  employeeManagement: boolean;
  summary: string;
};

export const ONBOARDING_BUSINESS_PROFILES: Record<
  OnboardingBusinessProfileCode,
  OnboardingBusinessProfile
> = {
  owner: {
    code: "owner",
    label: "Владелец компании",
    roleCode: "partner_owner",
    partnerPrices: true,
    catalog: true,
    orders: true,
    finance: true,
    employeeManagement: true,
    summary: "Партнёрские цены, заказы, финансы и управление сотрудниками.",
  },
  manager: {
    code: "manager",
    label: "Менеджер компании",
    roleCode: "partner_manager",
    partnerPrices: true,
    catalog: true,
    orders: true,
    finance: "optional",
    employeeManagement: false,
    summary: "Партнёрские цены и заказы. Финансы включаются отдельно.",
  },
  buyer: {
    code: "buyer",
    label: "Закупщик",
    roleCode: "partner_buyer",
    partnerPrices: true,
    catalog: true,
    orders: true,
    finance: false,
    employeeManagement: false,
    summary: "Каталог, партнёрские цены, корзина, заказы и сметы.",
  },
  accounting: {
    code: "accounting",
    label: "Бухгалтер",
    roleCode: "partner_accounting",
    partnerPrices: false,
    catalog: false,
    orders: false,
    finance: true,
    employeeManagement: false,
    summary: "Финансы и разрешённые документы без создания заказов.",
  },
  retail_only: {
    code: "retail_only",
    label: "Только розничные цены",
    roleCode: "partner_viewer",
    partnerPrices: false,
    catalog: true,
    orders: false,
    finance: false,
    employeeManagement: false,
    summary: "Каталог только с розничными ценами, без коммерческих данных партнёра.",
  },
};

export const ONBOARDING_PAYMENT_MODELS = [
  "inherited_from_1c",
  "prepayment",
  "credit",
  "mixed",
] as const;

export type OnboardingPaymentModel =
  (typeof ONBOARDING_PAYMENT_MODELS)[number];

export const ONBOARDING_PAYMENT_MODEL_LABELS: Record<
  OnboardingPaymentModel,
  string
> = {
  inherited_from_1c: "Определяется в 1С",
  prepayment: "Предоплата",
  credit: "Кредит",
  mixed: "Смешанная модель",
};

export function getOnboardingBusinessProfile(
  code: OnboardingBusinessProfileCode,
): OnboardingBusinessProfile {
  return ONBOARDING_BUSINESS_PROFILES[code];
}
