export type InstallationServiceType = "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration";
export type InstallationUnitCode = "piece" | "meter" | "service";

export type InstallationTariffSetDto = {
  tariffSetId: string;
  version: number;
  systemType: "cctv";
  currency: string;
  vatTreatment: "included" | "excluded" | "not_specified";
  effectiveFrom: string;
  lines: Array<{ serviceType: InstallationServiceType; unitCode: InstallationUnitCode; unitPrice: number }>;
};

export type InstallationPricingResult = {
  complete: boolean;
  tariffSetId: string | null;
  tariffVersion: number | null;
  currency: string | null;
  vatTreatment: InstallationTariffSetDto["vatTreatment"] | null;
  lines: Array<{ serviceType: InstallationServiceType; quantity: number; unitCode: InstallationUnitCode; unitPrice: number; amount: number }>;
  subtotal: number | null;
  missing: InstallationServiceType[];
};

export type PublicInstallationProviderDto = {
  providerId: string;
  displayName: string;
  description: string | null;
  logoPath: string | null;
  coverage: string;
  systemType: "cctv";
  availability: "available" | "limited";
};

export type RetailMarketplaceAdminReport = {
  tariffSets: Array<{ id: string; version: number; systemType: "cctv"; status: "draft" | "published" | "superseded" | "archived"; currency: string; vatTreatment: InstallationTariffSetDto["vatTreatment"]; effectiveFrom: string; effectiveTo: string | null; revision: number; lines: InstallationTariffSetDto["lines"] }>;
  providers: Array<{ id: string; providerType: "partner_company" | "internal_team"; backingName: string; operationalStatus: "active" | "inactive" | "suspended"; approvalStatus: "pending" | "approved" | "rejected"; marketplaceEnabled: boolean; revision: number; publicNameRu: string; publicNameRo: string; publicProfileStatus: "draft" | "published"; availability: "available" | "limited" | "unavailable"; maxConcurrentJobs: number | null; acceptanceSlaMinutes: number; competencies: string[]; regions: string[] }>;
  regions: Array<{ id: string; code: string; nameRu: string; nameRo: string; regionType: string }>;
  partnerCompanies: Array<{ id: string; name: string }>;
  internalTeams: Array<{ id: string; name: string }>;
};
