import "server-only";

import { getSupabaseEnvStatus } from "@/src/lib/env";

export type SupabaseHealthCheck = {
  ok: boolean;
  checks: {
    env: ReturnType<typeof getSupabaseEnvStatus>;
  };
};

export function checkSupabaseFoundationHealth(): SupabaseHealthCheck {
  const env = getSupabaseEnvStatus();

  return {
    ok: env.configured,
    checks: {
      env,
    },
  };
}
