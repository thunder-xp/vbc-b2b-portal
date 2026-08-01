import { z } from "zod";

import type { OnboardingRepository } from "../repositories";
import type { OnboardingDetail } from "../types";
import { OnboardingApplicationError } from "./onboarding-application.errors";

const applicationIdSchema = z.string().uuid();

export class OnboardingApplicationService {
  constructor(private readonly repository: OnboardingRepository) {}

  async getDetail(applicationId: string): Promise<OnboardingDetail> {
    const parsedId = applicationIdSchema.safeParse(applicationId);
    if (!parsedId.success) {
      throw new OnboardingApplicationError("ONBOARDING_APPLICATION_NOT_FOUND");
    }

    try {
      const detail = await this.repository.getDetail(parsedId.data);
      if (!detail) {
        throw new OnboardingApplicationError("ONBOARDING_APPLICATION_NOT_FOUND");
      }
      return detail;
    } catch (error) {
      if (error instanceof OnboardingApplicationError) throw error;
      if (postgresErrorCode(error) === "42501") {
        throw new OnboardingApplicationError("ONBOARDING_ACCESS_DENIED");
      }
      throw new OnboardingApplicationError("ONBOARDING_LOAD_FAILED");
    }
  }
}

function postgresErrorCode(error: unknown): string | null {
  const cause = error instanceof Error
    ? (error as Error & { cause?: unknown }).cause
    : null;
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code?: unknown }).code ?? "")
    : null;
}
