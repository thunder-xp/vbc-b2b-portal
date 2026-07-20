import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";

export type ProductCardWorkspaceContext = {
  commercialView: ProductCommercialViewDto | null;
  capabilities: ProductCardCapabilityModel;
  projectPriceEligible: boolean | null;
  technicalDocumentCount: number | null;
  compatibilitySummary: string | null;
};

export const RESTRICTED_PRODUCT_CARD_CAPABILITIES: ProductCardCapabilityModel = {
  showPrice: false,
  showStock: false,
  showExactQuantity: false,
  showWarehouseAvailability: false,
  showExpectedArrival: false,
  showProjectPriceEligibility: false,
  showTechnicalDocuments: false,
  showCompatibility: false,
  canAddToSpecification: false,
  canAddToOrder: false,
  canManagePurchasingLists: false,
  canAddToProject: false,
};
