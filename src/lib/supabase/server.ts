import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseServerEnv } from "@/src/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerEnv();

  return createServerClient(url, anonKey, {
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
}
