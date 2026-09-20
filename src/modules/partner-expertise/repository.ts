import type { AdminExpertiseVideo, ExpertiseLocale, ExpertiseSection, ExpertiseStatus, ExpertiseVideoInput, PartnerExpertiseVideo } from "./types";

export interface PartnerExpertiseRepository {
  listPartner(companyId: string, section: ExpertiseSection, locale: ExpertiseLocale): Promise<PartnerExpertiseVideo[]>;
  findPartner(companyId: string, videoId: string, locale: ExpertiseLocale): Promise<PartnerExpertiseVideo | null>;
  listAdmin(section: ExpertiseSection | null, status: ExpertiseStatus | null): Promise<{ items: AdminExpertiseVideo[]; total: number }>;
  findAdmin(videoId: string): Promise<AdminExpertiseVideo | null>;
  save(input: ExpertiseVideoInput & { youtubeVideoId: string; canonicalUrl: string }): Promise<string>;
  transition(videoId: string, action: "publish" | "unpublish" | "archive", revision: number): Promise<void>;
}
