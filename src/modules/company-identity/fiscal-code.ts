const FISCAL_CODE_FORMATTING = /[\s\u00a0\u200b\u202f\ufeff\p{P}\p{S}]+/gu;

export function normalizeFiscalCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(FISCAL_CODE_FORMATTING, "");
  return /^[0-9]+$/.test(normalized) ? normalized : null;
}
