import type { ERPProviderCapabilities } from "../../contracts";

export type OneCProviderConfig = {
  providerCode: "one-c";
  displayName: string;
  capabilities: ERPProviderCapabilities;
  requestTimeoutMs: number;
  baseUrl: string | null;
  apiToken: string | null;
  username: string | null;
  password: string | null;
  catalogCategoriesPath: string;
  catalogBrandsPath: string;
  catalogProductsPath: string;
  useMockCatalog: boolean;
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
