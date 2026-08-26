import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CheckoutConfiguration,
  CheckoutConfigurationRepository,
  CheckoutContractConfiguration,
} from "../checkout-configuration.repository";
import { OrderRepositoryError } from "../order.repository";

type Row = Record<string, unknown>;

export class SupabaseCheckoutConfigurationRepository
implements CheckoutConfigurationRepository {
  async getByCompanyId(companyId: string): Promise<CheckoutConfiguration | null> {
    const { data, error } = await createAdminClient().rpc(
      "get_partner_checkout_configuration",
      { p_company_id: companyId },
    );
    if (error) throw new OrderRepositoryError(error.code, error.message);
    if (!isRecord(data)) return null;
    return {
      companyId: text(data.companyId),
      counterpartyTypeCode: nullableText(data.counterpartyTypeCode),
      governmentBodyTypeCode: nullableText(data.governmentBodyTypeCode),
      counterpartyActive: data.counterpartyActive === true,
      counterpartyRef: text(data.counterpartyRef),
      priceTypeRef: text(data.priceTypeRef),
      publishedPriceCurrencyRef: text(data.publishedPriceCurrencyRef ?? data.currencyRef),
      publishedPriceCurrencyCode: text(data.publishedPriceCurrencyCode ?? data.currencyCode),
      cashDiagnosticCode: nullableText(data.cashDiagnosticCode),
      cashless: contract(data.cashless),
      cash: contract(data.cash),
      carriers: Array.isArray(data.carriers)
        ? data.carriers.filter(isRecord).map((carrier) => ({
            id: text(carrier.id),
            name: text(carrier.name),
            externalRef: text(carrier.externalRef),
          }))
        : [],
    };
  }
}

function contract(value: unknown): CheckoutContractConfiguration | null {
  if (!isRecord(value)) return null;
  return {
    contractRef: text(value.contractRef),
    name: text(value.name),
    number: nullableText(value.number),
    active: value.active === true,
    contractType: nullableText(value.contractType),
    organizationRef: nullableText(value.organizationRef),
    priceTypeRef: nullableText(value.priceTypeRef),
    settlementCurrencyRef: nullableText(value.settlementCurrencyRef ?? value.contractCurrencyRef),
    settlementCurrencyCode: nullableText(value.settlementCurrencyCode),
    authoritativePriceCurrencyRef: nullableText(
      value.authoritativePriceCurrencyRef ?? value.currencyRef,
    ),
    authoritativePriceCurrencyCode: nullableText(value.authoritativePriceCurrencyCode),
    publishedPriceCurrencyRef: nullableText(value.publishedPriceCurrencyRef ?? value.currencyRef),
    publishedPriceCurrencyCode: nullableText(value.publishedPriceCurrencyCode ?? value.currencyCode),
  };
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
