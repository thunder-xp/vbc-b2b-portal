import type { OneCEnv } from "@/src/lib/env";

import { PriceCoverageAuditService } from "../audits/price-coverage-audit.service";
import { SupabasePriceCoverageAuditRepository } from "../audits/supabase-price-coverage-audit.repository";
import { OneCPriceODataProvider } from "../providers/one-c";

export function createPriceCoverageAuditService(env: OneCEnv): PriceCoverageAuditService {
  return new PriceCoverageAuditService(
    new OneCPriceODataProvider({
      baseUrl: env.baseUrl,
      username: env.username,
      password: env.password,
      requestTimeoutMs: env.requestTimeoutMs,
    }),
    new SupabasePriceCoverageAuditRepository(),
  );
}
