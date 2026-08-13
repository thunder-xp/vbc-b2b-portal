import type { PublicRetailCheckoutDto, PublicRetailLocale, PublicRetailOrderCreatedDto, PublicRetailOrderDto, RetailAddressDto } from "../types";

export type RetailCheckoutCreateCommand = {
  locale: PublicRetailLocale;
  checkoutFingerprint: string;
  submissionKey: string;
  requestFingerprint: string;
  accessTokenHash: string;
  customer: { name: string; phone: string; email: string | null; processingAcknowledged: true };
  deliveryAddress: RetailAddressDto;
  installationAddress: RetailAddressDto | null;
};

export interface RetailCheckoutRepository {
  getCheckout(tokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailCheckoutDto | null>;
  createOrder(tokenHash: string, command: RetailCheckoutCreateCommand): Promise<PublicRetailOrderCreatedDto>;
  getOrder(accessTokenHash: string, locale: PublicRetailLocale): Promise<PublicRetailOrderDto | null>;
  getInstallationStatus(accessTokenHash: string, locale: PublicRetailLocale): Promise<{ status: "selecting_team" | "assigned"; label: string } | null>;
}
