import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseServerEnv } from "@/src/lib/env";
import { recordDatabaseQuery } from "@/src/lib/performance/request-diagnostics";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerEnv();

  return createServerClient(url, anonKey, {
    global: {
      fetch: async (input, init) => {
        const startedAt = performance.now();
        try {
          return await fetch(input, init);
        } finally {
          if (isPostgrestRequest(input)) recordDatabaseQuery(performance.now() - startedAt);
        }
      },
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
}

function isPostgrestRequest(input: RequestInfo | URL): boolean {
  const rawUrl = input instanceof Request ? input.url : input.toString();
  try {
    return new URL(rawUrl).pathname.startsWith("/rest/v1/");
  } catch {
    return false;
  }
}
