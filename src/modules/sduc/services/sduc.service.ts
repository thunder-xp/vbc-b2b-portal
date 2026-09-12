import "server-only";

import type { SducRepository } from "../repositories/sduc.repository";
import { SupabaseSducRepository } from "../repositories/supabase-sduc.repository";
import type {
  SducDecreaseEnvelope,
  SducMechanismType,
  SducPriceAuthorization,
} from "../types";
import { evaluateDecreaseEnvelope } from "./decrease-envelope";

export class SducService {
  constructor(private readonly repository: SducRepository) {}

  async evaluateDecreaseEnvelope(input: {
    companyId: string;
    productId: string;
    mechanismType: SducMechanismType;
    requestedDiscountPercent: string;
  }): Promise<SducDecreaseEnvelope> {
    const context = await this.repository.getDecreaseEvaluationContext(input);
    return evaluateDecreaseEnvelope({
      basePrice: context.basePrice,
      stopPrice: context.stopPrice,
      baseCurrency: context.baseCurrency,
      stopCurrency: context.stopCurrency,
      requestedDiscountPercent: input.requestedDiscountPercent,
      policy: context.policy,
    });
  }

  async authorizeDecrease(input: {
    companyId: string;
    productId: string;
    mechanismType: SducMechanismType;
    mechanismInstanceId: string;
    requestedDiscountPercent: string;
  }): Promise<SducPriceAuthorization | SducDecreaseEnvelope> {
    const context = await this.repository.getDecreaseEvaluationContext(input);
    const envelope = evaluateDecreaseEnvelope({
      basePrice: context.basePrice,
      stopPrice: context.stopPrice,
      baseCurrency: context.baseCurrency,
      stopCurrency: context.stopCurrency,
      requestedDiscountPercent: input.requestedDiscountPercent,
      policy: context.policy,
    });
    if (!envelope.eligible) return envelope;

    return this.repository.createDryRunAuthorization({
      context,
      mechanismInstanceId: input.mechanismInstanceId,
      requestedDiscountPercent: input.requestedDiscountPercent,
      approvedDiscountPercent: required(envelope.approvedDiscountPercent),
      reserveAbsolute: required(envelope.reserveAbsolute),
      reservePercent: required(envelope.reservePercent),
      effectivePrice: required(envelope.effectivePrice),
    });
  }
}

let service: SducService | null = null;

export function createSducService(): SducService {
  service ??= new SducService(new SupabaseSducRepository());
  return service;
}

function required(value: string | null): string {
  if (value === null) throw new Error("Eligible SDUC envelope is incomplete.");
  return value;
}
