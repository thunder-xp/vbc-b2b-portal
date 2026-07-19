import "server-only";

import { createCompanyAccessService, createPermissionService, createUserProfileService } from "../../access-control/actions/service-factory";
import { OneCProvider } from "../../integration/providers/one-c";
import { getOneCEnv } from "../../../lib/env";
import { SupabaseFinanceRepository } from "../repositories";
import { ContractBalanceSyncService, DefaultFinanceService } from "../services";
import { FinanceSyncAuthorizationService, FinanceSyncCoordinator } from "../services";
import { acquireSyncRunLock, releaseSyncRunLock } from "../../integration/sync";

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

export function createFinanceSyncCoordinator(): FinanceSyncCoordinator {
  const repository = new SupabaseFinanceRepository();
  const env = getOneCEnv();
  const provider = new OneCProvider({
    baseUrl: env.baseUrl,
    username: env.username,
    password: env.password,
    requestTimeoutMs: env.requestTimeoutMs,
    useMockPartners: false,
  });
  return new FinanceSyncCoordinator(
    repository,
    new ContractBalanceSyncService(repository, provider.finance),
    { acquire: acquireSyncRunLock, release: releaseSyncRunLock },
  );
}

export function createFinanceSyncAuthorizationService(): FinanceSyncAuthorizationService {
  return new FinanceSyncAuthorizationService(createUserProfileService(), new SupabaseFinanceRepository());
}
