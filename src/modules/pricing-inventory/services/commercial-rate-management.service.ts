import Decimal from "decimal.js";

import type { UserProfileService } from "../../access-control/services";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import type { PricingInventoryRepository } from "../repositories";
import {
  COMMERCIAL_RATE_PURPOSES,
  type CommercialRate,
  type CommercialRateVerification,
  type CommercialRateVerificationResult,
  type CommercialRateVerificationStatus,
  type CommercialRatePurpose,
  type PublishCommercialRateInput,
  type VerifyCommercialRateInput,
} from "../types";

const HISTORY_LIMIT = 40;

export type CommercialRateAdminRowDto = {
  purpose: CommercialRatePurpose;
  label: string;
  current: CommercialRate | null;
  latestVerification: CommercialRateVerification | null;
  verificationStatus: CommercialRateVerificationStatus;
};

export type CommercialRateAdminDto = {
  rates: CommercialRateAdminRowDto[];
  history: CommercialRate[];
  verificationHistory: CommercialRateVerification[];
};

export class CommercialRateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialRateValidationError";
  }
}

export class CommercialRateManagementService {
  constructor(
    private readonly repository: PricingInventoryRepository,
    private readonly userProfileService: UserProfileService,
  ) {}

  async getAdminView(actorUserId: string): Promise<CommercialRateAdminDto> {
    await this.ensureManager(actorUserId);
    if (!this.repository.listCommercialRateHistory || !this.repository.listCommercialRateVerifications) throw new ForbiddenError();
    const [history, verificationHistory] = await Promise.all([
      this.repository.listCommercialRateHistory(HISTORY_LIMIT),
      this.repository.listCommercialRateVerifications(HISTORY_LIMIT),
    ]);
    return {
      history,
      verificationHistory,
      rates: COMMERCIAL_RATE_PURPOSES.map((purpose) => this.toAdminRow(purpose, history, verificationHistory)),
    };
  }

  async verify(actorUserId: string, input: VerifyCommercialRateInput): Promise<CommercialRateVerificationResult> {
    await this.ensureManager(actorUserId);
    if (!this.repository.saveManualCommercialRateVerification) throw new ForbiddenError();
    return this.repository.saveManualCommercialRateVerification(validateVerification(input));
  }

  async publishObserved(actorUserId: string, input: VerifyCommercialRateInput): Promise<CommercialRateVerificationResult> {
    await this.ensureManager(actorUserId);
    if (!this.repository.publishVerifiedCommercialRate) throw new ForbiddenError();
    return this.repository.publishVerifiedCommercialRate(validateVerification(input));
  }

  async publish(actorUserId: string, input: PublishCommercialRateInput): Promise<CommercialRate> {
    await this.ensureManager(actorUserId);
    if (!this.repository.publishManualCommercialRate) throw new ForbiddenError();
    return this.repository.publishManualCommercialRate(validatePublication(input));
  }

  private async ensureManager(actorUserId: string): Promise<void> {
    const profile = await this.userProfileService.ensureActiveUser(actorUserId);
    if (profile.userType !== UserType.Internal && profile.userType !== UserType.Admin) {
      throw new ForbiddenError();
    }
    if (!this.repository.canManageCommercialRates || !(await this.repository.canManageCommercialRates())) {
      throw new ForbiddenError();
    }
  }

  private toAdminRow(purpose: CommercialRatePurpose, history: CommercialRate[], verifications: CommercialRateVerification[]): CommercialRateAdminRowDto {
    const purposeHistory = history.filter((rate) => rate.purpose === purpose);
    const current = purposeHistory.find((rate) => rate.isActive) ?? null;
    const latestVerification = verifications.find((verification) => verification.purpose === purpose) ?? null;
    return {
      purpose,
      label: purpose === "partner_price_usd_to_mdl"
        ? "Курс партнёрской цены BCRU 113, USD → MDL"
        : "Курс розничной цены RTL 999, USD → MDL",
      current,
      latestVerification,
      verificationStatus: latestVerification?.verificationStatus ?? "NOT_VERIFIED",
    };
  }
}

export function validateVerification(input: VerifyCommercialRateInput): VerifyCommercialRateInput {
  const normalized = validatePublication({
    purpose: input.purpose,
    rate: input.observed1cRate,
    effectiveDate: input.observed1cEffectiveDate,
    sourceNote: input.evidenceNote,
    evidenceComment: input.verificationComment,
  });
  return {
    purpose: normalized.purpose,
    observed1cRate: normalized.rate,
    observed1cEffectiveDate: normalized.effectiveDate,
    evidenceNote: normalized.sourceNote,
    verificationComment: normalized.evidenceComment,
  };
}

export function validatePublication(input: PublishCommercialRateInput): PublishCommercialRateInput {
  if (!COMMERCIAL_RATE_PURPOSES.includes(input.purpose)) {
    throw new CommercialRateValidationError("Назначение курса не поддерживается.");
  }
  let rate: Decimal;
  try {
    rate = new Decimal(input.rate.trim());
  } catch {
    throw new CommercialRateValidationError("Введите корректный положительный курс.");
  }
  if (!rate.isFinite() || !rate.greaterThan(0) || rate.greaterThan(1000) || rate.decimalPlaces() > 8) {
    throw new CommercialRateValidationError("Курс должен быть положительным числом с точностью до 8 знаков.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) {
    throw new CommercialRateValidationError("Укажите дату действия курса.");
  }
  const effectiveTimestamp = Date.parse(`${input.effectiveDate}T00:00:00.000Z`);
  if (!Number.isFinite(effectiveTimestamp) || effectiveTimestamp > Date.now() + 300_000) {
    throw new CommercialRateValidationError("Дата действия курса не может быть в будущем.");
  }
  const sourceNote = input.sourceNote.trim();
  const evidenceComment = input.evidenceComment?.trim() || null;
  if (sourceNote.length < 3 || sourceNote.length > 500 || (evidenceComment?.length ?? 0) > 1000) {
    throw new CommercialRateValidationError("Проверьте примечание к источнику курса.");
  }
  return {
    purpose: input.purpose,
    rate: rate.toFixed(),
    effectiveDate: input.effectiveDate,
    sourceNote,
    evidenceComment,
  };
}
