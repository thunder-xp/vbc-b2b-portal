export const FINAL_CUSTOMER_INDUSTRIES = [
  { code: "retail", label: "Розничная торговля" },
  { code: "horeca", label: "HoReCa" },
  { code: "manufacturing", label: "Производство" },
  { code: "logistics", label: "Логистика" },
  { code: "construction", label: "Строительство" },
  { code: "residential", label: "Жилая недвижимость" },
  { code: "office_commercial", label: "Офисы и коммерческая недвижимость" },
  { code: "banking_finance", label: "Банки и финансы" },
  { code: "education", label: "Образование" },
  { code: "healthcare", label: "Здравоохранение" },
  { code: "government_public", label: "Государственный сектор" },
  { code: "critical_infrastructure", label: "Критическая инфраструктура" },
  { code: "agriculture", label: "Сельское хозяйство" },
  { code: "security_integrator", label: "Безопасность / интегратор" },
  { code: "other", label: "Другое" },
] as const;

export type FinalCustomerIndustryCode = typeof FINAL_CUSTOMER_INDUSTRIES[number]["code"];

export function isFinalCustomerIndustryCode(value: unknown): value is FinalCustomerIndustryCode {
  return typeof value === "string" && FINAL_CUSTOMER_INDUSTRIES.some((item) => item.code === value);
}

export function finalCustomerIndustryLabel(code: FinalCustomerIndustryCode | null): string {
  return FINAL_CUSTOMER_INDUSTRIES.find((item) => item.code === code)?.label ?? "Не указана";
}
