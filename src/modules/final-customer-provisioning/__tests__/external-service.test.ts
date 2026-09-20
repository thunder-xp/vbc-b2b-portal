import { afterEach, describe, expect, it, vi } from "vitest";

import { ExternalCustomerProvisioningService, classifyCandidates } from "../external-service";
import type {
  ClaimedExternalProvisioningJob,
  ExternalCustomerProvisioningRepository,
  FinalCustomerCandidate,
  FinalCustomerMasterProvider,
} from "../external-types";

const job: ClaimedExternalProvisioningJob = {
  jobId: "11111111-1111-4111-8111-111111111111",
  leaseToken: "22222222-2222-4222-8222-222222222222",
  attemptCount: 1,
  customerIdentityId: "33333333-3333-4333-8333-333333333333",
  sourceOrderId: "44444444-4444-4444-8444-444444444444",
  operationKey: "55555555-5555-4555-8555-555555555555",
  createAttemptedAt: null,
  customerKind: "PERSON",
  displayName: "Maria Test",
  verifiedPhone: "+37369000111",
  email: "maria@example.test",
  existingExternalId: null,
};
const candidate: FinalCustomerCandidate = {
  externalId: "66666666-6666-4666-8666-666666666666",
  customerKind: "PERSON",
  displayName: job.displayName,
  phone: job.verifiedPhone,
  email: job.email,
  active: true,
  operationKey: null,
};

function repository(claims = [job], overrides: Partial<ExternalCustomerProvisioningRepository> = {}): ExternalCustomerProvisioningRepository {
  return {
    claim: vi.fn().mockResolvedValue(claims),
    markCreateAttempted: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockImplementation((_job, input) => Promise.resolve(input.outcome)),
    review: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function provider(overrides: Partial<FinalCustomerMasterProvider> = {}): FinalCustomerMasterProvider {
  return {
    findCandidates: vi.fn().mockResolvedValue({ value: [candidate], requestCount: 1, durationMs: 4 }),
    findByOperationKey: vi.fn().mockResolvedValue({ value: [], requestCount: 1, durationMs: 4 }),
    create: vi.fn().mockResolvedValue({ value: { externalId: candidate.externalId }, requestCount: 1, durationMs: 4 }),
    readBack: vi.fn().mockResolvedValue({ value: candidate, requestCount: 1, durationMs: 4 }),
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.ONE_C_CUSTOMER_PROVISIONING_ENABLED;
  vi.restoreAllMocks();
});

function enabled() { process.env.ONE_C_CUSTOMER_PROVISIONING_ENABLED = "true"; }

describe("ExternalCustomerProvisioningService", () => {
  it("A: exact phone plus email matches one authoritative customer", async () => {
    enabled();
    const repo = repository();
    const oneC = provider();
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result).toMatchObject({ matched: 1, created: 0 });
    expect(oneC.create).not.toHaveBeenCalled();
    expect(repo.complete).toHaveBeenCalledWith(job, expect.objectContaining({ outcome: "MATCHED", externalId: candidate.externalId }));
  });

  it("B: no candidate marks the attempt, creates, reads back and completes NEW", async () => {
    enabled();
    const repo = repository();
    const oneC = provider({ findCandidates: vi.fn().mockResolvedValue({ value: [], requestCount: 1, durationMs: 1 }) });
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result.created).toBe(1);
    expect(repo.markCreateAttempted).toHaveBeenCalledBefore(oneC.create as ReturnType<typeof vi.fn>);
    expect(oneC.readBack).toHaveBeenCalledWith(candidate.externalId);
  });

  it("C: multiple sufficient candidates become AMBIGUOUS without mapping or create", async () => {
    enabled();
    const repo = repository();
    const oneC = provider({ findCandidates: vi.fn().mockResolvedValue({ value: [candidate, { ...candidate, externalId: "77777777-7777-4777-8777-777777777777" }], requestCount: 1, durationMs: 1 }) });
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result.ambiguous).toBe(1);
    expect(repo.review).toHaveBeenCalledWith(job, expect.objectContaining({ state: "AMBIGUOUS", candidateCount: 2 }));
    expect(oneC.create).not.toHaveBeenCalled();
  });

  it("D: exact email on a different phone becomes CONFLICT", () => {
    expect(classifyCandidates(toRequest(), [{ ...candidate, phone: "+37369000999" }])).toEqual({ outcome: "CONFLICT" });
  });

  it("E: temporary provider outage schedules a bounded retry", async () => {
    enabled();
    const repo = repository();
    const oneC = provider({ findCandidates: vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "ONE_C_TIMEOUT" })) });
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result.retryScheduled).toBe(1);
    expect(repo.fail).toHaveBeenCalledWith(job, expect.objectContaining({ safeErrorCode: "ONE_C_TIMEOUT" }));
  });

  it("F: unknown create result reconciles by operation key and never creates again", async () => {
    enabled();
    const retryJob = { ...job, createAttemptedAt: "2026-09-20T00:00:00.000Z" };
    const repo = repository([retryJob]);
    const oneC = provider({ findByOperationKey: vi.fn().mockResolvedValue({ value: [{ ...candidate, operationKey: job.operationKey }], requestCount: 1, durationMs: 1 }) });
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result.created).toBe(1);
    expect(oneC.create).not.toHaveBeenCalled();
  });

  it("G: an empty duplicate claim has no side effects", async () => {
    enabled();
    const oneC = provider();
    const result = await new ExternalCustomerProvisioningService(repository([]), oneC).processBatch();
    expect(result.claimed).toBe(0);
    expect(oneC.findCandidates).not.toHaveBeenCalled();
  });

  it("H: existing external ref is read back and never written to 1C", async () => {
    enabled();
    const refJob = { ...job, existingExternalId: candidate.externalId };
    const oneC = provider();
    const result = await new ExternalCustomerProvisioningService(repository([refJob]), oneC).processBatch();
    expect(result.matched).toBe(1);
    expect(oneC.findCandidates).not.toHaveBeenCalled();
    expect(oneC.create).not.toHaveBeenCalled();
  });

  it("I: persistence conflict remains CONFLICT", async () => {
    enabled();
    const repo = repository([job], { complete: vi.fn().mockResolvedValue("CONFLICT") });
    const result = await new ExternalCustomerProvisioningService(repo, provider()).processBatch();
    expect(result.conflicts).toBe(1);
  });

  it("J: disabled external processing never touches the account or provider path", async () => {
    const repo = repository();
    const oneC = provider();
    const result = await new ExternalCustomerProvisioningService(repo, oneC).processBatch();
    expect(result.enabled).toBe(false);
    expect(repo.claim).not.toHaveBeenCalled();
    expect(oneC.findCandidates).not.toHaveBeenCalled();
  });
});

function toRequest() {
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
