import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseServerEnv } from "@/src/lib/env";
import { recordDatabaseQuery } from "@/src/lib/performance/request-diagnostics";

export function createPublicReadClient(options?: { cache?: RequestCache }) {
  const { url, anonKey } = getSupabaseServerEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: async (input, init) => {
        const startedAt = performance.now();
        try {
          return await fetch(input, options?.cache ? { ...init, cache: options.cache } : init);
        } finally {
          recordDatabaseQuery(performance.now() - startedAt);
        }
      },
    },
  });
}
