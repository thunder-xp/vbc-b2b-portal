export type CheckoutPaymentMethod = "cashless" | "cash";
export type CheckoutFulfillmentMethod = "pickup" | "delivery";

export type CheckoutContractConfiguration = {
  contractRef: string;
  name: string;
  number: string | null;
  active: boolean;
  contractType: string | null;
  organizationRef: string | null;
  priceTypeRef: string | null;
  settlementCurrencyRef: string | null;
  settlementCurrencyCode: string | null;
  authoritativePriceCurrencyRef: string | null;
  authoritativePriceCurrencyCode: string | null;
  publishedPriceCurrencyRef: string | null;
  publishedPriceCurrencyCode: string | null;
};

export type CheckoutCarrierConfiguration = {
  id: string;
  name: string;
  externalRef: string;
};

export type CheckoutConfiguration = {
  companyId: string;
  counterpartyTypeCode: string | null;
  governmentBodyTypeCode: string | null;
  counterpartyActive: boolean;
  counterpartyRef: string;
  priceTypeRef: string;
  publishedPriceCurrencyRef: string;
  publishedPriceCurrencyCode: string;
  cashDiagnosticCode: string | null;
  cashless: CheckoutContractConfiguration | null;
  cash: CheckoutContractConfiguration | null;
  carriers: CheckoutCarrierConfiguration[];
};

export interface CheckoutConfigurationRepository {
  getByCompanyId(companyId: string): Promise<CheckoutConfiguration | null>;
}
