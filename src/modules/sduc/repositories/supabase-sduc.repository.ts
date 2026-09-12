import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CreateSducAuthorizationInput,
  SducEvaluationContext,
  SducRepository,
} from "./sduc.repository";
import type {
  SducMechanismType,
  SducPriceAuthorization,
} from "../types";

export class SupabaseSducRepository implements SducRepository {
  async getDecreaseEvaluationContext(input: {
    companyId: string;
    productId: string;
    mechanismType: SducMechanismType;
  }): Promise<SducEvaluationContext> {
    const { data, error } = await createAdminClient().rpc(
      "get_sduc_decrease_evaluation_context",
      {
        p_company_id: input.companyId,
        p_product_id: input.productId,
        p_mechanism_type: input.mechanismType,
      },
    );
    if (error || !data) throw new Error("SDUC evaluation context is unavailable.");
    return mapContext(data as Record<string, unknown>);
  }

  async createDryRunAuthorization(
    input: CreateSducAuthorizationInput,
  ): Promise<SducPriceAuthorization> {
    const { context } = input;
    const { data, error } = await createAdminClient().rpc(
      "create_sduc_decrease_authorization",
      {
        p_company_id: context.companyId,
        p_product_id: context.productId,
        p_mechanism_type: context.policy.mechanismType,
        p_mechanism_instance_id: input.mechanismInstanceId,
        p_requested_discount_percent: input.requestedDiscountPercent,
        p_approved_discount_percent: input.approvedDiscountPercent,
        p_effective_price: input.effectivePrice,
        p_expected_base_price: context.basePrice,
        p_expected_stop_price: context.stopPrice,
        p_expected_currency: context.baseCurrency,
      },
    );
    if (error || !data) throw new Error("SDUC authorization could not be recorded.");
    return mapAuthorization(data as Record<string, unknown>);
  }
}

function mapContext(row: Record<string, unknown>): SducEvaluationContext {
  return {
    companyId: String(row.companyId),
    productId: String(row.productId),
    basePrice: nullableString(row.basePrice),
    stopPrice: nullableString(row.stopPrice),
    baseCurrency: nullableString(row.baseCurrency),
    stopCurrency: nullableString(row.stopCurrency),
    baseSourceVersion: nullableString(row.baseSourceVersion),
    stopSourceVersion: nullableString(row.stopSourceVersion),
    policy: {
      id: String(row.policyId),
      mechanismType: String(row.mechanismType) as SducMechanismType,
      direction: String(row.direction) as "DECREASE",
      enabled: Boolean(row.enabled),
      executionMode: String(row.executionMode) as "DRY_RUN",
      globalCeilingPercent: nullableString(row.globalCeilingPercent),
      mechanismMaximumPercent: nullableString(row.mechanismMaximumPercent),
      discountStepsPercent: Array.isArray(row.discountStepsPercent)
        ? row.discountStepsPercent.map(String)
        : [],
      stackable: Boolean(row.stackable),
      validitySeconds:
        row.validitySeconds === null ? null : Number(row.validitySeconds),
      priority: Number(row.priority),
    },
  };
}

function mapAuthorization(row: Record<string, unknown>): SducPriceAuthorization {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productId: String(row.product_id),
    direction: String(row.direction) as "DECREASE",
    mechanismType: String(row.mechanism_type) as SducMechanismType,
    mechanismInstanceId: String(row.mechanism_instance_id),
    basePrice: String(row.base_price),
    stopPrice: String(row.stop_price),
    currency: String(row.currency),
    requestedDiscountPercent: String(row.requested_discount_percent),
    approvedDiscountPercent: String(row.approved_discount_percent),
    effectivePrice: String(row.effective_price),
    validFrom: String(row.valid_from),
    validUntil: String(row.valid_until),
    status: String(row.status) as "ACTIVE",
    executionMode: String(row.execution_mode) as "DRY_RUN",
    priority: Number(row.policy_priority),
    baseSourceVersion: nullableString(row.base_source_version),
    stopSourceVersion: nullableString(row.stop_source_version),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
