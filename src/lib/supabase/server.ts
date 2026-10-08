import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { getSupabaseServerEnv } from "@/src/lib/env";
import { diagnosticFetch } from "./diagnostic-fetch";

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerEnv();

  return createServerClient(url, anonKey, {
    global: {
      fetch: diagnosticFetch,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }: {
              name: string;
              value: string;
              options: CookieOptions;
            }) => {
              cookieStore.set(name, value, options);
            },
          );
        } catch {
          // Server Components cannot set cookies. Middleware or Server Actions
          // should handle session refresh writes when auth is implemented.
        }
      },
    },
  });
});
