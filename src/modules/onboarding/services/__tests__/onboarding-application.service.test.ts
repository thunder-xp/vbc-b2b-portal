import { describe, expect, it, vi } from "vitest";

import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { OnboardingRepository } from "../../repositories";
import type { OnboardingDetailRecord } from "../../types";
import {
  ONBOARDING_APPLICATION_ERROR_CODES,
  OnboardingApplicationError,
  OnboardingApplicationService,
} from "../index";
import { evaluateCompanyVerification } from "../onboarding-application.service";

const APPLICATION_ID = "689b8aa3-4b47-4eda-b91e-b77f182667d0";

describe("OnboardingApplicationService", () => {
  it("loads a production-shaped access request by application id", async () => {
    const detail = detailRecord();
    const getDetail = vi.fn().mockResolvedValue(detail);

    await expect(service(getDetail).getDetail(APPLICATION_ID)).resolves.toMatchObject({
      request: detail.request,
      companyVerification: { outcome: "exact_match_found", blocked: false },
    });
    expect(getDetail).toHaveBeenCalledWith(APPLICATION_ID);
  });

  it("returns typed not-found errors for missing and malformed application ids", async () => {
    const getDetail = vi.fn().mockResolvedValue(null);

    await expect(service(getDetail).getDetail(APPLICATION_ID)).rejects.toMatchObject({
      code: "ONBOARDING_APPLICATION_NOT_FOUND",
    });
    await expect(service(getDetail).getDetail("not-a-uuid")).rejects.toMatchObject({
      code: "ONBOARDING_APPLICATION_NOT_FOUND",
    });
    expect(getDetail).toHaveBeenCalledTimes(1);
  });

  it("distinguishes access denial from operational loader failure", async () => {
    const denied = new RepositoryUnexpectedError({ cause: { code: "42501" } });
    const readOnly = new RepositoryUnexpectedError({ cause: { code: "25006" } });

    await expect(service(vi.fn().mockRejectedValue(denied)).getDetail(APPLICATION_ID))
      .rejects.toMatchObject({ code: "ONBOARDING_ACCESS_DENIED" });
    await expect(service(vi.fn().mockRejectedValue(readOnly)).getDetail(APPLICATION_ID))
      .rejects.toMatchObject({ code: "ONBOARDING_LOAD_FAILED" });
  });

  it("keeps terminal applications readable", async () => {
    for (const status of ["approved", "rejected"] as const) {
      const detail = detailRecord(status);
      await expect(service(vi.fn().mockResolvedValue(detail)).getDetail(APPLICATION_ID))
        .resolves.toMatchObject({ request: { status } });
    }
  });

  it.each([
    ["no_match", [], {}],
    ["multiple_matches", [candidate(), candidate("00000000-0000-0000-0000-000000000003")], {}],
    ["counterparty_inactive", [candidate(undefined, { active: false })], {}],
    ["commercial_mapping_incomplete", [candidate(undefined, { contractCount: 0 })], {}],
    ["directory_stale", [candidate()], { lastSuccessfulAt: "2026-07-28T00:00:00.000Z" }],
    ["directory_sync_failed", [candidate()], { latestStatus: "failed", latestStartedAt: "2026-08-01T11:00:00.000Z" }],
  ] as const)("returns the %s company-verification outcome", (outcome, candidates, context) => {
    const detail = detailRecord("under_review", [...candidates], context);
    expect(evaluateCompanyVerification(detail, Date.parse("2026-08-01T12:00:00.000Z"))).toMatchObject({ outcome });
  });

  it("exposes the governed onboarding error vocabulary", () => {
    expect(ONBOARDING_APPLICATION_ERROR_CODES).toEqual(expect.arrayContaining([
      "ONBOARDING_APPLICATION_NOT_FOUND",
      "ONBOARDING_ACCESS_DENIED",
      "ONBOARDING_INVALID_STATE",
      "ONBOARDING_1C_MATCH_REQUIRED",
      "ONBOARDING_ALREADY_DECIDED",
      "ONBOARDING_ACTIVATION_FAILED",
    ]));
    expect(new OnboardingApplicationError("ONBOARDING_INVALID_STATE").name)
      .toBe("OnboardingApplicationError");
  });
});

function service(getDetail: ReturnType<typeof vi.fn>): OnboardingApplicationService {
  return new OnboardingApplicationService({ getDetail } as unknown as OnboardingRepository);
}

function detailRecord(
  status = "received",
  candidates: ReturnType<typeof candidate>[] = [candidate()],
  context: Partial<OnboardingDetailRecord["companyVerificationContext"]> = {},
): OnboardingDetailRecord {
  return {
    request: { id: APPLICATION_ID, status },
    candidates,
    companyVerificationContext: {
      latestStatus: "succeeded",
      latestStartedAt: "2026-08-01T10:00:00.000Z",
      latestFinishedAt: "2026-08-01T10:01:00.000Z",
      latestSafeErrorCode: null,
      lastSuccessfulAt: "2026-08-01T10:01:00.000Z",
      waitingSince: null,
      waitingInternalNote: null,
      ...context,
    },
  } as OnboardingDetailRecord;
}

function candidate(id = "00000000-0000-0000-0000-000000000002", overrides = {}) {
  return {
    id,
    matchReason: "exact_fiscal_code",
    active: true,
    contractCount: 1,
    priceProfileCount: 1,
    ...overrides,
  } as OnboardingDetailRecord["candidates"][number];
}
