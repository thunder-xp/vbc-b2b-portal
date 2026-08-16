import type { PublicInstallationLeadAdminRow, PublicInstallationLeadResult } from "../types";

export interface PublicInstallationLeadRepository {
  createPublicInstallationLead(input: { locale: "ru" | "ro"; customerName: string; phoneE164: string; locality: string; objectType: string; systemType: string; comment: string | null; sourcePath: string; consent: boolean; submissionKey: string; requesterFingerprint: string; duplicateFingerprint: string }): Promise<PublicInstallationLeadResult>;
  listPublicInstallationLeads(limit?: number): Promise<PublicInstallationLeadAdminRow[]>;
}
