import type { CampaignDraftInput } from "./types";

export const CAMPAIGN_DRAFT_CONTRACT_VERSION = 1 as const;

export type CampaignDraftFieldKey =
  | "campaign_code"
  | "campaign_name"
  | "partner_title"
  | "partner_description"
  | "campaign_period"
  | "campaign_priority"
  | "campaign_image"
  | "campaign_terms"
  | "selected_products"
  | "product_limit"
  | "audience_rule";

export type CampaignDraftErrorCode =
  | "CAMPAIGN_CODE_REQUIRED"
  | "CAMPAIGN_CODE_INVALID"
  | "CAMPAIGN_CODE_CONFLICT"
  | "CAMPAIGN_NAME_REQUIRED"
  | "CAMPAIGN_TITLE_REQUIRED"
  | "CAMPAIGN_DESCRIPTION_REQUIRED"
  | "CAMPAIGN_PERIOD_INVALID"
  | "CAMPAIGN_PRIORITY_INVALID"
  | "CAMPAIGN_IMAGE_PATH_INVALID"
  | "CAMPAIGN_TERMS_REQUIRED"
  | "CAMPAIGN_PRODUCTS_REQUIRED"
  | "CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED"
  | "CAMPAIGN_PRODUCT_LIMIT_INVALID"
  | "CAMPAIGN_PRODUCT_UNAVAILABLE"
  | "CAMPAIGN_AUDIENCE_REQUIRED"
  | "CAMPAIGN_REQUEST_INVALID"
  | "UNKNOWN_SERVER_ERROR";

export type CampaignValidationIssue = {
  fieldKey: CampaignDraftFieldKey;
  step: 0 | 1 | 2;
  label: string;
  code: CampaignDraftErrorCode;
  focusTarget: string;
  message: string;
};

export const CAMPAIGN_REQUIRED_FIELD_CONTRACT = [
  { fieldKey: "campaign_code", step: 0, label: "Код кампании", safeErrorCode: "CAMPAIGN_CODE_REQUIRED", focusTarget: "campaign-code", businessRule: "3–40 символов: латиница, цифры, дефис или подчёркивание." },
  { fieldKey: "campaign_name", step: 0, label: "Название кампании", safeErrorCode: "CAMPAIGN_NAME_REQUIRED", focusTarget: "campaign-name", businessRule: "Внутреннее название длиной 3–160 символов." },
  { fieldKey: "partner_title", step: 0, label: "Заголовок для партнёра", safeErrorCode: "CAMPAIGN_TITLE_REQUIRED", focusTarget: "campaign-title", businessRule: "Партнёрский заголовок длиной 3–160 символов." },
  { fieldKey: "partner_description", step: 0, label: "Описание для партнёра", safeErrorCode: "CAMPAIGN_DESCRIPTION_REQUIRED", focusTarget: "campaign-description", businessRule: "Описание длиной 10–2000 символов." },
  { fieldKey: "campaign_period", step: 0, label: "Период кампании", safeErrorCode: "CAMPAIGN_PERIOD_INVALID", focusTarget: "campaign-start", businessRule: "Корректные даты; окончание строго позже начала." },
  { fieldKey: "campaign_terms", step: 0, label: "Краткие условия", safeErrorCode: "CAMPAIGN_TERMS_REQUIRED", focusTarget: "campaign-terms", businessRule: "Условия длиной 3–1000 символов." },
  { fieldKey: "selected_products", step: 1, label: "Товары", safeErrorCode: "CAMPAIGN_PRODUCTS_REQUIRED", focusTarget: "campaign-product-search", businessRule: "От 1 до 50 активных видимых товаров локального каталога." },
  { fieldKey: "product_limit", step: 1, label: "Минимум и лимит товара", safeErrorCode: "CAMPAIGN_PRODUCT_LIMIT_INVALID", focusTarget: "campaign-products", businessRule: "Минимум 1–9999; лимит не ниже минимума и не выше 999999." },
  { fieldKey: "audience_rule", step: 2, label: "Аудитория", safeErrorCode: "CAMPAIGN_AUDIENCE_REQUIRED", focusTarget: "campaign-audience", businessRule: "Управляемое правило; для явной аудитории нужна хотя бы одна активная компания." },
] as const;

export const CAMPAIGN_ERROR_MESSAGES: Record<CampaignDraftErrorCode, string> = {
  CAMPAIGN_CODE_REQUIRED: "Введите код кампании.",
  CAMPAIGN_CODE_INVALID: "Используйте 3–40 символов: латиницу, цифры, дефис или подчёркивание.",
  CAMPAIGN_CODE_CONFLICT: "Кампания с таким кодом уже существует. Укажите другой код.",
  CAMPAIGN_NAME_REQUIRED: "Введите название кампании.",
  CAMPAIGN_TITLE_REQUIRED: "Введите заголовок для партнёра.",
  CAMPAIGN_DESCRIPTION_REQUIRED: "Добавьте описание для партнёра — не менее 10 символов.",
  CAMPAIGN_PERIOD_INVALID: "Проверьте даты начала и окончания.",
  CAMPAIGN_PRIORITY_INVALID: "Приоритет должен быть целым числом от 0 до 1000.",
  CAMPAIGN_IMAGE_PATH_INVALID: "Путь изображения должен начинаться с / и содержать только безопасные символы.",
  CAMPAIGN_TERMS_REQUIRED: "Добавьте краткие условия кампании.",
  CAMPAIGN_PRODUCTS_REQUIRED: "Выберите хотя бы один товар.",
  CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED: "В одной кампании можно выбрать не более 50 товаров.",
  CAMPAIGN_PRODUCT_LIMIT_INVALID: "Проверьте минимум и лимит выбранного товара.",
  CAMPAIGN_PRODUCT_UNAVAILABLE: "Один из выбранных товаров больше недоступен. Обновите список товаров.",
  CAMPAIGN_AUDIENCE_REQUIRED: "Выберите аудиторию.",
  CAMPAIGN_REQUEST_INVALID: "Обновите страницу и повторите создание кампании.",
  UNKNOWN_SERVER_ERROR: "Не удалось создать кампанию. Попробуйте ещё раз.",
};

export function validateCampaignDraft(input: CampaignDraftInput): CampaignValidationIssue[] {
  const issues: CampaignValidationIssue[] = [];
  const push = (issue: CampaignValidationIssue) => {
    if (!issues.some((current) => current.code === issue.code && current.focusTarget === issue.focusTarget)) issues.push(issue);
  };
  if (!input.code.trim()) push(issue("campaign_code", 0, "Код кампании", "CAMPAIGN_CODE_REQUIRED", "campaign-code"));
  else if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(input.code.trim().toUpperCase())) push(issue("campaign_code", 0, "Код кампании", "CAMPAIGN_CODE_INVALID", "campaign-code"));
  if (input.name.trim().length < 3 || input.name.trim().length > 160) push(issue("campaign_name", 0, "Название кампании", "CAMPAIGN_NAME_REQUIRED", "campaign-name"));
  if (input.partnerTitle.trim().length < 3 || input.partnerTitle.trim().length > 160) push(issue("partner_title", 0, "Заголовок для партнёра", "CAMPAIGN_TITLE_REQUIRED", "campaign-title"));
  if (input.partnerDescription.trim().length < 10 || input.partnerDescription.trim().length > 2000) push(issue("partner_description", 0, "Описание для партнёра", "CAMPAIGN_DESCRIPTION_REQUIRED", "campaign-description"));
  const starts = Date.parse(input.startsAt);
  const ends = Date.parse(input.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) push(issue("campaign_period", 0, "Период кампании", "CAMPAIGN_PERIOD_INVALID", "campaign-start"));
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 1000) push(issue("campaign_priority", 0, "Приоритет", "CAMPAIGN_PRIORITY_INVALID", "campaign-priority"));
  if (input.imageAssetPath && (input.imageAssetPath.length > 500 || !/^\/[A-Za-z0-9_./-]+$/.test(input.imageAssetPath))) push(issue("campaign_image", 0, "Путь изображения", "CAMPAIGN_IMAGE_PATH_INVALID", "campaign-image"));
  if (input.termsSummary.trim().length < 3 || input.termsSummary.trim().length > 1000) push(issue("campaign_terms", 0, "Краткие условия", "CAMPAIGN_TERMS_REQUIRED", "campaign-terms"));
  if (!input.items.length) push(issue("selected_products", 1, "Товары", "CAMPAIGN_PRODUCTS_REQUIRED", "campaign-product-search"));
  else if (input.items.length > 50) push(issue("selected_products", 1, "Товары", "CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED", "campaign-products"));
  input.items.forEach((item) => {
    const invalid = !item.productId || !Number.isInteger(item.minimumQuantity) || item.minimumQuantity < 1 || item.minimumQuantity > 9999
      || item.maximumQuantityPerCompany !== null && (!Number.isInteger(item.maximumQuantityPerCompany) || item.maximumQuantityPerCompany < item.minimumQuantity || item.maximumQuantityPerCompany > 999999);
    if (invalid) push(issue("product_limit", 1, "Минимум и лимит товара", "CAMPAIGN_PRODUCT_LIMIT_INVALID", `campaign-product-${item.productId}-minimum`));
  });
  if (!input.audienceMode || input.audienceMode === "explicit_company" && !input.companyIds.length) push(issue("audience_rule", 2, "Аудитория", "CAMPAIGN_AUDIENCE_REQUIRED", "campaign-audience"));
  if (input.contractVersion !== CAMPAIGN_DRAFT_CONTRACT_VERSION || !isUuid(input.requestId)) push(issue("campaign_name", 0, "Запрос создания", "CAMPAIGN_REQUEST_INVALID", "campaign-name"));
  return issues;
}

export function firstIssueForStep(issues: CampaignValidationIssue[], step: number) {
  return issues.find((current) => current.step === step);
}

function issue(fieldKey: CampaignDraftFieldKey, step: 0 | 1 | 2, label: string, code: CampaignDraftErrorCode, focusTarget: string): CampaignValidationIssue {
  return { fieldKey, step, label, code, focusTarget, message: CAMPAIGN_ERROR_MESSAGES[code] };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
