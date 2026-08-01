import { describe, expect, it, vi } from "vitest";

import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { OnboardingRepository } from "../../repositories";
import type { OnboardingDetail } from "../../types";
import {
  ONBOARDING_APPLICATION_ERROR_CODES,
  OnboardingApplicationError,
  OnboardingApplicationService,
} from "../index";

const APPLICATION_ID = "689b8aa3-4b47-4eda-b91e-b77f182667d0";

describe("OnboardingApplicationService", () => {
  it("loads a production-shaped access request by application id", async () => {
    const detail = { request: { id: APPLICATION_ID, status: "received" } } as OnboardingDetail;
    const getDetail = vi.fn().mockResolvedValue(detail);

    await expect(service(getDetail).getDetail(APPLICATION_ID)).resolves.toBe(detail);
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
      const detail = { request: { id: APPLICATION_ID, status } } as OnboardingDetail;
      await expect(service(vi.fn().mockResolvedValue(detail)).getDetail(APPLICATION_ID))
        .resolves.toBe(detail);
    }
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
