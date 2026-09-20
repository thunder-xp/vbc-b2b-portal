import "server-only";

import type {
  ClaimedExternalProvisioningJob,
  ExternalCustomerProvisioningRepository,
  FinalCustomerCandidate,
  FinalCustomerMasterProvider,
  FinalCustomerProvisioningRequest,
} from "./external-types";

const MAX_BATCH = 5;

export class ExternalCustomerProvisioningService {
  constructor(
    private readonly repository: ExternalCustomerProvisioningRepository,
    private readonly provider: FinalCustomerMasterProvider,
  ) {}

  async processBatch(limit = MAX_BATCH) {
    if (process.env.ONE_C_CUSTOMER_PROVISIONING_ENABLED !== "true") {
      return emptyResult(false);
    }
    const claims = await this.repository.claim(Math.min(MAX_BATCH, Math.max(1, limit)));
    const outcomes: string[] = [];
    for (const claim of claims) outcomes.push(await this.processClaim(claim));
    return {
      enabled: true,
      claimed: claims.length,
      matched: outcomes.filter((value) => value === "MATCHED").length,
      created: outcomes.filter((value) => value === "NEW").length,
      ambiguous: outcomes.filter((value) => value === "AMBIGUOUS").length,
      conflicts: outcomes.filter((value) => value === "CONFLICT").length,
      retryScheduled: outcomes.filter((value) => value === "FAILED_RETRYABLE").length,
    };
  }

  private async processClaim(job: ClaimedExternalProvisioningJob): Promise<string> {
    const request = toRequest(job);
    let requestCount = 0;
    let durationMs = 0;
    try {
      if (job.customerKind !== "PERSON") {
        await this.repository.review(job, metrics("CONFLICT", "UNSUPPORTED_CUSTOMER_KIND", 0, requestCount, durationMs));
        return "CONFLICT";
      }

      if (job.existingExternalId) {
        const readBack = await this.provider.readBack(job.existingExternalId);
        requestCount += readBack.requestCount;
        durationMs += readBack.durationMs;
        if (!readBack.value || !candidateMatchesRequest(readBack.value, request)) {
          await this.repository.review(job, metrics("CONFLICT", "EXISTING_REFERENCE_MISMATCH", readBack.value ? 1 : 0, requestCount, durationMs));
          return "CONFLICT";
        }
        return this.repository.complete(job, {
          outcome: "MATCHED", externalId: readBack.value.externalId, candidateCount: 1,
          providerRequestCount: requestCount, providerDurationMs: durationMs,
        });
      }

      if (job.createAttemptedAt) {
        const reconciled = await this.provider.findByOperationKey(request);
        requestCount += reconciled.requestCount;
        durationMs += reconciled.durationMs;
        if (reconciled.value.length === 1) {
          return this.readBackAndComplete(job, request, "NEW", reconciled.value[0].externalId, 0, requestCount, durationMs);
        }
        if (reconciled.value.length > 1) {
          await this.repository.review(job, metrics("AMBIGUOUS", "CREATE_RESULT_AMBIGUOUS", reconciled.value.length, requestCount, durationMs));
          return "AMBIGUOUS";
        }
        await this.repository.fail(job, failure("CREATE_RESULT_UNKNOWN", requestCount, durationMs));
        return "FAILED_RETRYABLE";
      }

      const discovery = await this.provider.findCandidates(request);
      requestCount += discovery.requestCount;
      durationMs += discovery.durationMs;
      const classification = classifyCandidates(request, discovery.value);
      if (classification.outcome === "AMBIGUOUS" || classification.outcome === "CONFLICT") {
        await this.repository.review(job, metrics(
          classification.outcome,
          classification.outcome === "AMBIGUOUS" ? "MULTIPLE_AUTHORITATIVE_MATCHES" : "IDENTITY_EVIDENCE_CONFLICT",
          discovery.value.length,
          requestCount,
          durationMs,
        ));
        return classification.outcome;
      }
      if (classification.outcome === "MATCHED") {
        return this.readBackAndComplete(job, request, "MATCHED", classification.candidate.externalId, discovery.value.length, requestCount, durationMs);
      }

      if (!await this.repository.markCreateAttempted(job)) throw codeError("STALE_EXTERNAL_PROVISIONING_CLAIM");
      const created = await this.provider.create(request);
      requestCount += created.requestCount;
      durationMs += created.durationMs;
      return this.readBackAndComplete(job, request, "NEW", created.value.externalId, 0, requestCount, durationMs);
    } catch (error) {
      await this.repository.fail(job, failure(safeErrorCode(error), requestCount, durationMs));
      return "FAILED_RETRYABLE";
    }
  }

  private async readBackAndComplete(
    job: ClaimedExternalProvisioningJob,
    request: FinalCustomerProvisioningRequest,
    outcome: "MATCHED" | "NEW",
    externalId: string,
    candidateCount: number,
    requestCount: number,
    durationMs: number,
  ) {
    const readBack = await this.provider.readBack(externalId);
    requestCount += readBack.requestCount;
    durationMs += readBack.durationMs;
    if (!readBack.value || !candidateMatchesRequest(readBack.value, request)) {
      await this.repository.review(job, metrics("CONFLICT", "AUTHORITATIVE_READ_BACK_MISMATCH", candidateCount, requestCount, durationMs));
      return "CONFLICT";
    }
    return this.repository.complete(job, {
      outcome, externalId: readBack.value.externalId, candidateCount,
      providerRequestCount: requestCount, providerDurationMs: durationMs,
    });
  }
}

export function classifyCandidates(
  request: FinalCustomerProvisioningRequest,
  candidates: FinalCustomerCandidate[],
): { outcome: "NEW" } | { outcome: "MATCHED"; candidate: FinalCustomerCandidate } | { outcome: "AMBIGUOUS" | "CONFLICT" } {
  const active = candidates.filter((candidate) => candidate.active && candidate.customerKind === request.customerKind);
  const sufficient = active.filter((candidate) => candidateMatchesRequest(candidate, request));
  if (sufficient.length > 1) return { outcome: "AMBIGUOUS" };
  if (sufficient.length === 1) return { outcome: "MATCHED", candidate: sufficient[0] };
  if (active.some((candidate) => hasEmail(candidate, request.email) && !candidate.phones.includes(request.verifiedPhone))) {
    return { outcome: "CONFLICT" };
  }
  return { outcome: "NEW" };
}

function candidateMatchesRequest(candidate: FinalCustomerCandidate, request: FinalCustomerProvisioningRequest) {
  if (!candidate.active || candidate.customerKind !== request.customerKind || !candidate.phones.includes(request.verifiedPhone)) return false;
  return hasEmail(candidate, request.email) || normalizeName(candidate.displayName) === normalizeName(request.displayName);
}

function hasEmail(candidate: FinalCustomerCandidate, email: string | null) {
  if (!email) return false;
  const expected = email.trim().toLowerCase();
  return candidate.emails.some((candidateEmail) => candidateEmail.trim().toLowerCase() === expected);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function toRequest(job: ClaimedExternalProvisioningJob): FinalCustomerProvisioningRequest {
  return {
    customerIdentityId: job.customerIdentityId,
    provisioningJobId: job.jobId,
    sourceOrderId: job.sourceOrderId,
    operationKey: job.operationKey,
    customerKind: job.customerKind,
    displayName: job.displayName,
    verifiedPhone: job.verifiedPhone,
    email: job.email,
  };
}

function metrics(state: "AMBIGUOUS" | "CONFLICT", safeErrorCode: string, candidateCount: number, providerRequestCount: number, providerDurationMs: number) {
  return { state, safeErrorCode, candidateCount, providerRequestCount, providerDurationMs };
}

function failure(safeErrorCode: string, providerRequestCount: number, providerDurationMs: number) {
  return { safeErrorCode, providerRequestCount, providerDurationMs };
}

function safeErrorCode(error: unknown) {
  const raw = typeof error === "object" && error !== null && "code" in error ? String(error.code ?? "") : "";
  return /^[A-Z0-9_]{2,80}$/.test(raw) ? raw : "ONE_C_CUSTOMER_RETRYABLE";
}

function codeError(code: string) {
  return Object.assign(new Error(code), { code });
}

function emptyResult(enabled: boolean) {
  return { enabled, claimed: 0, matched: 0, created: 0, ambiguous: 0, conflicts: 0, retryScheduled: 0 };
}
