import { NOVOTECH_ONE_C_ORGANIZATION_REF } from "../../integration/config";
import { parseRequiredOneCGuid } from "../../integration/providers/one-c";
import type { FinanceRepository } from "../repositories";
import type { FinanceSyncCompany } from "../types";
import type { ContractBalanceSyncService } from "./finance.service";

const COMPANY_BATCH_LIMIT = 10;
const COMPANY_LOCK_TTL_SECONDS = 300;

export type FinanceSyncTrigger = "manual" | "scheduled";
export type FinanceCompanySyncResult = {
  companyId: string;
  companyName: string;
  status: "succeeded" | "zero_balance" | "mapping_missing" | "failed" | "locked";
  received: number;
  published: number;
  excludedDeleted: number;
  oneCCallCount: number;
  durationMs: number;
  errorCode: string | null;
};

export type FinanceSyncBatchResult = {
  companies: FinanceCompanySyncResult[];
  nextCursor: string | null;
  eligibleCompanies: number;
  succeeded: number;
  zeroBalanceCompanies: number;
  missingMappings: number;
  failed: number;
  locked: number;
  publishedRows: number;
  oneCCallCount: number;
  durationMs: number;
};

export interface FinanceCompanySyncLock {
  acquire(scope: string, runId: string, ttlSeconds: number): Promise<"acquired" | "locked" | "stale_lock_recovered">;
  release(scope: string, runId: string): Promise<void>;
}

export class FinanceSyncCoordinator {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly syncService: ContractBalanceSyncService,
    private readonly lock: FinanceCompanySyncLock,
    private readonly now: () => number = Date.now,
    private readonly organizationRef: string = NOVOTECH_ONE_C_ORGANIZATION_REF,
  ) {}

  async synchronizeCompany(input: { companyId: string; trigger: FinanceSyncTrigger; actorUserId: string | null }): Promise<FinanceCompanySyncResult> {
    const target = await this.repository.getSyncCompany(input.companyId);
    if (!target) throw new Error("Finance synchronization company was not found.");
    return this.synchronizeTarget(target, input);
  }

  async synchronizeCompanies(input: { afterCompanyId?: string; limit?: number; trigger: FinanceSyncTrigger; actorUserId: string | null }): Promise<FinanceSyncBatchResult> {
    const startedAt = this.now();
    const limit = Math.min(Math.max(input.limit ?? COMPANY_BATCH_LIMIT, 1), COMPANY_BATCH_LIMIT);
    const targets = await this.repository.listSyncCompanies({ afterCompanyId: input.afterCompanyId, limit });
    const companies: FinanceCompanySyncResult[] = [];
    for (const target of targets) {
      try {
        companies.push(await this.synchronizeTarget(target, input));
      } catch (error) {
        companies.push(failedResult(target, error));
      }
    }
    return summarizeBatch(companies, targets.length === limit ? targets.at(-1)?.companyId ?? null : null, this.now() - startedAt);
  }

  private async synchronizeTarget(target: FinanceSyncCompany, input: { trigger: FinanceSyncTrigger; actorUserId: string | null }): Promise<FinanceCompanySyncResult> {
    const startedAt = this.now();
    const mappingError = !parseRequiredOneCGuid(target.counterpartyRef)
      ? "counterparty_mapping_missing"
      : !parseRequiredOneCGuid(this.organizationRef) ? "organization_mapping_missing" : null;
    if (mappingError) {
      await this.repository.recordSyncResult({ companyId: target.companyId, status: "mapping_missing", trigger: input.trigger, actorUserId: input.actorUserId, errorCode: mappingError });
      return result(target, "mapping_missing", this.now() - startedAt, { errorCode: mappingError });
    }

    const runId = crypto.randomUUID();
    const scope = `finance_contract_balance:${target.companyId}`;
    const lockResult = await this.lock.acquire(scope, runId, COMPANY_LOCK_TTL_SECONDS);
    if (lockResult === "locked") {
      await this.repository.recordSyncResult({ companyId: target.companyId, status: "locked", trigger: input.trigger, actorUserId: input.actorUserId });
      return result(target, "locked", this.now() - startedAt);
    }

    await this.repository.recordSyncResult({ companyId: target.companyId, status: "running", trigger: input.trigger, actorUserId: input.actorUserId });
    try {
      const synchronized = await this.syncService.synchronize({
        companyId: target.companyId,
        counterpartyRef: target.counterpartyRef,
        organizationRef: this.organizationRef,
        trigger: input.trigger,
        actorUserId: input.actorUserId,
      });
      const status = synchronized.published > 0 ? "succeeded" : "zero_balance";
      console.info({
        event: "finance_contract_balance_company_synchronized",
        companyId: target.companyId,
        status,
        received: synchronized.received,
        published: synchronized.published,
        excludedDeleted: synchronized.diagnostics.deletedContractCount,
        oneCCallCount: synchronized.diagnostics.oneCCallCount,
        durationMs: synchronized.durationMs,
        publicationDurationMs: synchronized.publicationDurationMs,
      });
      return result(target, status, this.now() - startedAt, {
        received: synchronized.received,
        published: synchronized.published,
        excludedDeleted: synchronized.diagnostics.deletedContractCount,
        oneCCallCount: synchronized.diagnostics.oneCCallCount,
      });
    } catch (error) {
      const errorCode = safeErrorCode(error);
      await this.repository.recordSyncResult({ companyId: target.companyId, status: "failed", trigger: input.trigger, actorUserId: input.actorUserId, errorCode, durationMs: this.now() - startedAt });
      console.error({ event: "finance_contract_balance_company_failed", companyId: target.companyId, errorCode, durationMs: this.now() - startedAt });
      return result(target, "failed", this.now() - startedAt, { errorCode });
    } finally {
      await this.lock.release(scope, runId);
    }
  }
}

function result(target: FinanceSyncCompany, status: FinanceCompanySyncResult["status"], durationMs: number, values: Partial<FinanceCompanySyncResult> = {}): FinanceCompanySyncResult {
  return { companyId: target.companyId, companyName: target.companyName, status, received: 0, published: 0, excludedDeleted: 0, oneCCallCount: 0, durationMs: Math.max(0, Math.round(durationMs)), errorCode: null, ...values };
}

function failedResult(target: FinanceSyncCompany, error: unknown): FinanceCompanySyncResult {
  return result(target, "failed", 0, { errorCode: safeErrorCode(error) });
}

function summarizeBatch(companies: FinanceCompanySyncResult[], nextCursor: string | null, durationMs: number): FinanceSyncBatchResult {
  return {
    companies, nextCursor, eligibleCompanies: companies.filter((row) => row.status !== "mapping_missing").length,
    succeeded: companies.filter((row) => row.status === "succeeded").length,
    zeroBalanceCompanies: companies.filter((row) => row.status === "zero_balance").length,
    missingMappings: companies.filter((row) => row.status === "mapping_missing").length,
    failed: companies.filter((row) => row.status === "failed").length,
    locked: companies.filter((row) => row.status === "locked").length,
    publishedRows: companies.reduce((sum, row) => sum + row.published, 0),
    oneCCallCount: companies.reduce((sum, row) => sum + row.oneCCallCount, 0),
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

function safeErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.name : typeof error;
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown_error";
}
