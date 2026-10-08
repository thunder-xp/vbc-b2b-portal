import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdminEnv } from "@/src/lib/env";
import { diagnosticFetch } from "./diagnostic-fetch";

export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();

  return createClient(url, serviceRoleKey, {
    global: { fetch: diagnosticFetch },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
