import "server-only";

import { createCompanyAccessService, createPermissionService } from "../../access-control/actions/service-factory";
import { OneCProvider } from "../../integration/providers/one-c";
import { getOneCEnv } from "../../../lib/env";
import { SupabaseFinanceRepository } from "../repositories";
import { ContractBalanceSyncService, DefaultFinanceService } from "../services";

export function createFinanceService(): DefaultFinanceService {
  return new DefaultFinanceService(
    new SupabaseFinanceRepository(),
    createCompanyAccessService(),
    createPermissionService(),
  );
}

export function createContractBalanceSyncService(): ContractBalanceSyncService {
  const env = getOneCEnv();
  const provider = new OneCProvider({
    baseUrl: env.baseUrl,
    username: env.username,
    password: env.password,
    requestTimeoutMs: env.requestTimeoutMs,
    useMockPartners: false,
  });
  return new ContractBalanceSyncService(new SupabaseFinanceRepository(), provider.finance);
}
