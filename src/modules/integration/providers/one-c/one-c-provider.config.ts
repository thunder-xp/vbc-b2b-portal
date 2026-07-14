import type { ERPProviderCapabilities } from "../../contracts";

export type OneCProviderConfig = {
  providerCode: "one-c";
  displayName: string;
  capabilities: ERPProviderCapabilities;
  requestTimeoutMs: number;
  baseUrl: string | null;
  username: string | null;
  password: string | null;
  catalogCategoriesPath: string;
  catalogBrandsPath: string;
  catalogProductsPath: string;
  productPricesPath: string;
  stockBalancesPath: string;
  partnerSearchPageSize: number;
  partnerSearchMaxPages: number;
  useMockCatalog: boolean;
  useMockPricing: boolean;
  useMockInventory: boolean;
  useMockPartners: boolean;
  useLegacyMinimalOrderPayload: boolean;
};

export const ONE_C_PROVIDER_CODE = "one-c";

export const oneCProviderDefaultCapabilities: ERPProviderCapabilities = {
  catalog: true,
  pricing: true,
  inventory: true,
  orders: true,
  documents: true,
  finance: true,
  partners: true,
};
