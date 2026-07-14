import "server-only";

const REQUIRED_SUPABASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type RequiredSupabaseEnvName = (typeof REQUIRED_SUPABASE_ENV)[number];
export type OneCAuthMode = "basic" | "none";

export type OneCEnv = {
  baseUrl: string | null;
  username: string | null;
  password: string | null;
  catalogCategoriesPath: string;
  catalogBrandsPath: string;
  catalogProductsPath: string;
  productPricesPath: string;
  stockBalancesPath: string;
  partnerSearchPageSize: number;
  partnerSearchMaxPages: number;
  requestTimeoutMs: number;
  authMode: OneCAuthMode;
  useMockCatalog: boolean;
  useMockPricing: boolean;
  useMockInventory: boolean;
  useMockPartners: boolean;
  useLegacyMinimalOrderPayload?: boolean;
};

export type SupabaseEnvStatus = {
  configured: boolean;
  missing: RequiredSupabaseEnvName[];
};

function readRequiredEnv(name: RequiredSupabaseEnvName): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnv() {
  return {
    url: readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getSupabaseAdminEnv() {
  return {
    url: readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getSupabaseEnvStatus(): SupabaseEnvStatus {
  const missing = REQUIRED_SUPABASE_ENV.filter((name) => !process.env[name]);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function getOneCEnv(): OneCEnv {
  const username = process.env.ONEC_USERNAME || null;
  const password = process.env.ONEC_PASSWORD || null;
  const explicitMock = process.env.ONEC_USE_MOCK_CATALOG === "true";
  const explicitPricingMock = process.env.ONEC_USE_MOCK_PRICING === "true";
  const explicitInventoryMock = process.env.ONEC_USE_MOCK_INVENTORY === "true";
  const explicitPartnersMock = process.env.ONEC_USE_MOCK_PARTNERS === "true";

  return {
    baseUrl: process.env.ONEC_BASE_URL || null,
    username,
    password,
    catalogCategoriesPath:
      process.env.ONEC_CATALOG_CATEGORIES_PATH || "/catalog/categories",
    catalogBrandsPath: process.env.ONEC_CATALOG_BRANDS_PATH || "/catalog/brands",
    catalogProductsPath:
      process.env.ONEC_CATALOG_PRODUCTS_PATH || "/catalog/products",
    productPricesPath:
      process.env.ONEC_PRODUCT_PRICES_PATH || "/pricing/product-prices",
    stockBalancesPath:
      process.env.ONEC_STOCK_BALANCES_PATH || "/inventory/stock-balances",
    partnerSearchPageSize: readPositiveIntegerEnv("ONEC_PARTNER_SEARCH_PAGE_SIZE", 50),
    partnerSearchMaxPages: readPositiveIntegerEnv("ONEC_PARTNER_SEARCH_MAX_PAGES", 10),
    requestTimeoutMs: readPositiveIntegerEnv("ONEC_TIMEOUT_MS", 10000),
    authMode:
      process.env.ONEC_AUTH_MODE === "basic" || (username && password)
        ? "basic"
        : "none",
    useMockCatalog: explicitMock || !process.env.ONEC_BASE_URL,
    useMockPricing: explicitPricingMock || !process.env.ONEC_BASE_URL,
    useMockInventory: explicitInventoryMock || !process.env.ONEC_BASE_URL,
    useMockPartners: explicitPartnersMock,
    useLegacyMinimalOrderPayload:
      process.env.ONEC_USE_LEGACY_MINIMAL_ORDER_PAYLOAD === "true",
  };
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
