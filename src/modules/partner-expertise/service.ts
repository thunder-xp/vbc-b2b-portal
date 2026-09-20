import type { PartnerExpertiseRepository } from "./repository";
import type { ExpertiseLocale, ExpertiseSection, ExpertiseStatus, ExpertiseVideoInput } from "./types";
import { normalizeYouTubeUrl } from "./youtube";

export class PartnerExpertiseService {
  constructor(private readonly repository: PartnerExpertiseRepository) {}

  listPartner(companyId: string, section: ExpertiseSection, locale: ExpertiseLocale) {
    return this.repository.listPartner(companyId, section, locale);
  }
  getPartner(companyId: string, videoId: string, locale: ExpertiseLocale) {
    return this.repository.findPartner(companyId, videoId, locale);
  }
  listAdmin(section: ExpertiseSection | null, status: ExpertiseStatus | null) {
    return this.repository.listAdmin(section, status);
  }
  getAdmin(videoId: string) {
    return this.repository.findAdmin(videoId);
  }
  async save(input: ExpertiseVideoInput) {
    const normalized = normalizeYouTubeUrl(input.youtubeUrl);
    return await this.repository.save({ ...input, youtubeVideoId: normalized.videoId, canonicalUrl: normalized.canonicalUrl });
  }
  transition(videoId: string, action: "publish" | "unpublish" | "archive", revision: number) {
    return this.repository.transition(videoId, action, revision);
  }
}
