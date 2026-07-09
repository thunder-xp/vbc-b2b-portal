import "server-only";

const REQUIRED_SUPABASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type RequiredSupabaseEnvName = (typeof REQUIRED_SUPABASE_ENV)[number];
export type OneCAuthMode = "token" | "basic" | "none";

export type OneCEnv = {
  baseUrl: string | null;
  username: string | null;
  password: string | null;
  apiToken: string | null;
  catalogCategoriesPath: string;
  catalogBrandsPath: string;
  catalogProductsPath: string;
  authMode: OneCAuthMode;
  useMockCatalog: boolean;
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
  const apiToken = process.env.ONEC_API_TOKEN || null;
  const username = process.env.ONEC_USERNAME || null;
  const password = process.env.ONEC_PASSWORD || null;
  const explicitMock = process.env.ONEC_USE_MOCK_CATALOG === "true";

  return {
    baseUrl: process.env.ONEC_BASE_URL || null,
    username,
    password,
    apiToken,
    catalogCategoriesPath:
      process.env.ONEC_CATALOG_CATEGORIES_PATH || "/catalog/categories",
    catalogBrandsPath: process.env.ONEC_CATALOG_BRANDS_PATH || "/catalog/brands",
    catalogProductsPath:
      process.env.ONEC_CATALOG_PRODUCTS_PATH || "/catalog/products",
    authMode: apiToken ? "token" : username && password ? "basic" : "none",
    useMockCatalog: explicitMock || !process.env.ONEC_BASE_URL,
  };
}
