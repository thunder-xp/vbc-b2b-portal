import Decimal from "decimal.js";

import type { UserProfileService } from "../../access-control/services";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { evaluateFreshness, type FreshnessView } from "../../integration/freshness";
import type { PricingInventoryRepository } from "../repositories";
import {
  COMMERCIAL_RATE_PURPOSES,
  type CommercialRate,
  type CommercialRatePurpose,
  type PublishCommercialRateInput,
} from "../types";

const HISTORY_LIMIT = 40;

export type CommercialRateAdminRowDto = {
  purpose: CommercialRatePurpose;
  label: string;
  current: CommercialRate | null;
  previous: CommercialRate | null;
  changePercent: number | null;
  freshness: FreshnessView;
};

export type CommercialRateAdminDto = {
  rates: CommercialRateAdminRowDto[];
  history: CommercialRate[];
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
    if (!this.repository.listCommercialRateHistory) throw new ForbiddenError();
    const history = await this.repository.listCommercialRateHistory(HISTORY_LIMIT);
    return {
      history,
      rates: COMMERCIAL_RATE_PURPOSES.map((purpose) => this.toAdminRow(purpose, history)),
    };
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

  private toAdminRow(purpose: CommercialRatePurpose, history: CommercialRate[]): CommercialRateAdminRowDto {
    const purposeHistory = history.filter((rate) => rate.purpose === purpose);
    const current = purposeHistory.find((rate) => rate.isActive) ?? null;
    const previous = current
      ? purposeHistory.find((rate) => rate.id === current.previousRateId) ?? purposeHistory.find((rate) => rate.id !== current.id) ?? null
      : null;
    return {
      purpose,
      label: purpose === "partner_price_usd_to_mdl"
        ? "Курс партнёрской цены USD → MDL"
        : "Курс розничной цены MDL → USD",
      current,
      previous,
      changePercent: current && previous
        ? new Decimal(current.rate).minus(previous.rate).div(previous.rate).times(100).toDecimalPlaces(4).toNumber()
        : null,
      freshness: evaluateFreshness(current?.publishedAt, "price", "Коммерческие курсы"),
    };
  }
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
