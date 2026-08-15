import type { PublicRetailCheckoutDto, PublicRetailCommercialOfferDto, PublicRetailInstallationStatusDto, PublicRetailLocale, PublicRetailOrderCreatedDto, PublicRetailOrderDto, RetailAddressDto } from "../types";

export type RetailCheckoutCreateCommand = {
  locale: PublicRetailLocale;
  checkoutFingerprint: string;
  submissionKey: string;
  requestFingerprint: string;
  accessTokenHash: string;
  customer: { name: string; phone: string; email: string | null; processingAcknowledged: true };
  deliveryAddress: RetailAddressDto;
  installationAddress: RetailAddressDto | null;
  commercialOfferId: string | null;
  installationSelectionMode: "customer_selected" | "automatic" | null;
  preferredProviderId: string | null;
  installationRegionCode: string | null;
};

export interface RetailCheckoutRepository {
  getCheckout(tokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailCheckoutDto | null>;
  createCommercialOffer(tokenHash: string, idempotencyKey: string, locale: PublicRetailLocale): Promise<PublicRetailCommercialOfferDto>;
  getCommercialOffer(tokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailCommercialOfferDto | null>;
  createOrder(tokenHash: string, command: RetailCheckoutCreateCommand): Promise<PublicRetailOrderCreatedDto>;
  getOrder(accessTokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailOrderDto | null>;
  getInstallationStatus(accessTokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailInstallationStatusDto | null>;
  transitionInstallation(input: { accessTokenHash: string; command: "confirm" | "report_issue"; expectedRevision: number; category: string | null; note: string | null; idempotencyKey: string }): Promise<{ state: string; revision: number; repeated: boolean }>;
}
