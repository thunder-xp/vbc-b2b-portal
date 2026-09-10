import { describe, expect, it, vi } from "vitest";

import type {
  FailedRegistrationAuthAdminGateway,
  FailedRegistrationPurgeRepository,
} from "../../repositories/failed-registration-purge.repository";
import type { FailedRegistrationPurgeReadiness } from "../../types";
import {
  FailedRegistrationPurgeService,
} from "../failed-registration-purge.service";

const identity = {
  requestId: "20000000-0000-4000-8000-000000000001",
  userId: "10000000-0000-4000-8000-000000000001",
  email: "failed@example.test",
  applicationName: "Failed company",
  actorUserId: "a0000000-0000-4000-8000-000000000001",
  correlationId: "80000000-0000-4000-8000-000000000001",
};
const receiptId = "80000000-0000-4000-8000-000000000001";

describe("FailedRegistrationPurgeService", () => {
  it("orchestrates readiness, atomic local purge, Auth Admin deletion, and final verification", async () => {
    const { service, repository, authAdmin } = fixture(ready());

    await expect(service.purge(identity)).resolves.toMatchObject({
      receiptId,
      status: "completed",
      authDeletion: "deleted",
      idempotent: false,
    });
    expect(repository.purgeLocal).toHaveBeenCalledWith(identity);
    expect(authAdmin.deleteUser).toHaveBeenCalledWith(identity.userId);
    expect(repository.complete).toHaveBeenCalledWith(receiptId);
    expect(repository.markAuthFailure).not.toHaveBeenCalled();
  });

  it("returns a typed recovery receipt when Auth deletion fails after local purge", async () => {
    const { service, repository, authAdmin } = fixture(ready());
    vi.mocked(authAdmin.deleteUser).mockRejectedValue(
      Object.assign(new Error("provider unavailable"), { code: "auth_provider_unavailable" }),
    );

    await expect(service.purge(identity)).rejects.toMatchObject({
      code: "AUTH_DELETE_FAILED_LOCAL_PURGED",
      receiptId,
    });
    expect(repository.markAuthFailure).toHaveBeenCalledWith(
      receiptId,
      "AUTH_PROVIDER_UNAVAILABLE",
    );
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("resumes an Auth-failed receipt without rerunning local deletion", async () => {
    const { service, repository, authAdmin } = fixture(recovery("auth_delete_failed"));

    await expect(service.purge(identity)).resolves.toMatchObject({
      authDeletion: "deleted",
      idempotent: true,
    });
    expect(repository.purgeLocal).not.toHaveBeenCalled();
    expect(authAdmin.deleteUser).toHaveBeenCalledOnce();
    expect(repository.complete).toHaveBeenCalledWith(receiptId);
  });

  it("treats an already-missing Auth user as an idempotent successful retry", async () => {
    const { service, repository, authAdmin } = fixture(recovery("completed"));
    vi.mocked(authAdmin.getUserEmail).mockReset().mockResolvedValue(null);

    await expect(service.purge(identity)).resolves.toMatchObject({
      authDeletion: "already_missing",
      idempotent: true,
    });
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(repository.complete).toHaveBeenCalledWith(receiptId);
  });

  it.each([
    "PROTECTED_MEMBERSHIP",
    "APPROVED_ONBOARDING",
    "PROTECTED_USER_REFERENCE",
    "STORAGE_OWNERSHIP",
  ])("propagates the %s readiness blocker without mutating", async (blockerCode) => {
    const { service, repository, authAdmin } = fixture(blocked(blockerCode));

    await expect(service.purge(identity)).rejects.toMatchObject({
      code: "FAILED_REGISTRATION_PURGE_BLOCKED",
      blockerCodes: [blockerCode],
    });
    expect(repository.purgeLocal).not.toHaveBeenCalled();
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects exact-identity mismatches before local mutation", async () => {
    const mismatch = {
      ...ready(),
      eligible: false,
      state: "blocked" as const,
      blockers: [{ code: "EMAIL_MISMATCH", count: 1 }],
    };
    const { service, repository } = fixture(mismatch);

    await expect(service.purge(identity)).rejects.toMatchObject({
      code: "FAILED_REGISTRATION_IDENTITY_MISMATCH",
    });
    expect(repository.purgeLocal).not.toHaveBeenCalled();
  });

  it("does not report success when completion fails after Auth deletion", async () => {
    const { service, repository } = fixture(ready());
    vi.mocked(repository.complete).mockRejectedValue(new Error("database unavailable"));

    await expect(service.purge(identity)).rejects.toMatchObject({
      code: "AUTH_DELETED_FINALIZATION_PENDING",
      receiptId,
    });
  });
});

function fixture(readiness: FailedRegistrationPurgeReadiness) {
  const repository: FailedRegistrationPurgeRepository = {
    getReadiness: vi.fn().mockResolvedValue(readiness),
    purgeLocal: vi.fn().mockResolvedValue({
      receiptId,
      status: "local_purged",
      requestId: identity.requestId,
      userId: identity.userId,
      deletedCounts: { profiles: 1, accessRequests: 1 },
    }),
    markAuthFailure: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue({
      receiptId,
      status: "completed",
      deletedCounts: { profiles: 1, accessRequests: 1 },
      remainingCounts: { profiles: 0, accessRequests: 0 },
    }),
  };
  const authAdmin: FailedRegistrationAuthAdminGateway = {
    getUserEmail: vi.fn()
      .mockResolvedValueOnce(identity.email)
      .mockResolvedValueOnce(null),
    deleteUser: vi.fn().mockResolvedValue("deleted"),
  };
  return {
    repository,
    authAdmin,
    service: new FailedRegistrationPurgeService(repository, authAdmin),
  };
}

function ready(): FailedRegistrationPurgeReadiness {
  return {
    eligible: true,
    state: "ready",
    requestId: identity.requestId,
    userId: identity.userId,
    email: identity.email,
    applicationName: identity.applicationName,
    receiptId: null,
    blockers: [],
    counts: { profiles: 1, accessRequests: 1 },
  };
}

function recovery(
  state: "local_purged" | "auth_delete_failed" | "completed",
): FailedRegistrationPurgeReadiness {
  return {
    ...ready(),
    state,
    receiptId,
    counts: { profiles: 1, accessRequests: 1 },
  };
}

function blocked(code: string): FailedRegistrationPurgeReadiness {
  return {
    ...ready(),
    eligible: false,
    state: "blocked",
    blockers: [{ code, count: 1 }],
  };
}
