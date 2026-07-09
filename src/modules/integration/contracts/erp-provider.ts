import type { CatalogProvider } from "./catalog-provider";
import type { DocumentProvider } from "./document-provider";
import type { FinanceProvider } from "./finance-provider";
import type { InventoryProvider } from "./inventory-provider";
import type { OrderProvider } from "./order-provider";
import type { PartnerProvider } from "./partner-provider";
import type { PricingProvider } from "./pricing-provider";

export type ERPProviderCapabilities = {
  catalog: boolean;
  pricing: boolean;
  inventory: boolean;
  orders: boolean;
  documents: boolean;
  finance: boolean;
  partners: boolean;
};

export type ERPProviderHealth = {
  providerCode: string;
  isAvailable: boolean;
  checkedAt: string;
  message: string | null;
};

export interface ERPProvider {
  readonly providerCode: string;
  readonly capabilities: ERPProviderCapabilities;
  readonly catalog: CatalogProvider | null;
  readonly pricing: PricingProvider | null;
  readonly inventory: InventoryProvider | null;
  readonly orders: OrderProvider | null;
  readonly documents: DocumentProvider | null;
  readonly finance: FinanceProvider | null;
  readonly partners: PartnerProvider | null;
  checkHealth(): Promise<ERPProviderHealth>;
}
