export type FinalCustomerKind = "PERSON" | "LEGAL_ENTITY";
export type FinalCustomerExternalOutcome = "MATCHED" | "NEW" | "AMBIGUOUS" | "CONFLICT";

export type ClaimedExternalProvisioningJob = Readonly<{
  jobId: string;
  leaseToken: string;
  attemptCount: number;
  customerIdentityId: string;
  sourceOrderId: string;
  operationKey: string;
  createAttemptedAt: string | null;
  customerKind: FinalCustomerKind;
  displayName: string;
  verifiedPhone: string;
  email: string | null;
  existingExternalId: string | null;
}>;

export type FinalCustomerProvisioningRequest = Readonly<{
  customerIdentityId: string;
  provisioningJobId: string;
  sourceOrderId: string;
  operationKey: string;
  customerKind: FinalCustomerKind;
  displayName: string;
  verifiedPhone: string;
  email: string | null;
}>;

export type FinalCustomerCandidate = Readonly<{
  externalId: string;
  customerKind: FinalCustomerKind;
  displayName: string;
  phones: readonly string[];
  emails: readonly string[];
  active: boolean;
  operationKey: string | null;
}>;

export type FinalCustomerProviderResult<T> = Readonly<{
  value: T;
  requestCount: number;
  durationMs: number;
}>;

export interface FinalCustomerMasterProvider {
  findCandidates(request: FinalCustomerProvisioningRequest): Promise<FinalCustomerProviderResult<FinalCustomerCandidate[]>>;
  findByOperationKey(request: FinalCustomerProvisioningRequest): Promise<FinalCustomerProviderResult<FinalCustomerCandidate[]>>;
  create(request: FinalCustomerProvisioningRequest): Promise<FinalCustomerProviderResult<{ externalId: string }>>;
  readBack(externalId: string): Promise<FinalCustomerProviderResult<FinalCustomerCandidate | null>>;
}

export interface ExternalCustomerProvisioningRepository {
  claim(limit: number): Promise<ClaimedExternalProvisioningJob[]>;
  markCreateAttempted(job: ClaimedExternalProvisioningJob): Promise<boolean>;
  complete(job: ClaimedExternalProvisioningJob, input: {
    outcome: "MATCHED" | "NEW";
    externalId: string;
    candidateCount: number;
    providerRequestCount: number;
    providerDurationMs: number;
  }): Promise<"MATCHED" | "NEW" | "CONFLICT">;
  review(job: ClaimedExternalProvisioningJob, input: {
    state: "AMBIGUOUS" | "CONFLICT";
    safeErrorCode: string;
    candidateCount: number;
    providerRequestCount: number;
    providerDurationMs: number;
  }): Promise<boolean>;
  fail(job: ClaimedExternalProvisioningJob, input: {
    safeErrorCode: string;
    providerRequestCount: number;
    providerDurationMs: number;
  }): Promise<boolean>;
}
