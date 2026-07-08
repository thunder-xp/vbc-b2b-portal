import "server-only";

const REQUIRED_SUPABASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type RequiredSupabaseEnvName = (typeof REQUIRED_SUPABASE_ENV)[number];

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
