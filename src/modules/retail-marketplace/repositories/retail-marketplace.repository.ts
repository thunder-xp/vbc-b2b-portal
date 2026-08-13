import type { InstallationTariffSetDto, PublicInstallationProviderDto, RetailMarketplaceAdminReport } from "../types";

export interface RetailMarketplaceRepository {
  getCurrentTariffs(systemType: "cctv"): Promise<InstallationTariffSetDto | null>;
  listPublicProviders(systemType: "cctv", regionCode: string, locale: "ru" | "ro"): Promise<PublicInstallationProviderDto[]>;
  getAdminReport(): Promise<RetailMarketplaceAdminReport>;
  saveTariffDraft(input: { tariffSetId: string | null; effectiveFrom: string; currency: string; vatTreatment: string; lines: unknown[]; expectedRevision: number; reason: string }): Promise<string>;
  publishTariff(input: { tariffSetId: string; expectedRevision: number; reason: string }): Promise<void>;
  saveProvider(input: { providerId: string | null; providerType: "partner_company" | "internal_team"; backingId: string; profile: Record<string, unknown>; competencies: string[]; regionCodes: string[]; expectedRevision: number; reason: string }): Promise<string>;
}
