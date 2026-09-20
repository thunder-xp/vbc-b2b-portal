import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { PartnerExpertiseRepository } from "./repository";
import type { AdminExpertiseVideo, ExpertiseLocale, ExpertiseSection, ExpertiseStatus, ExpertiseVideoInput, PartnerExpertiseVideo } from "./types";

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.code ?? "RPC_ERROR"}`);
  return data as T;
}

export class SupabasePartnerExpertiseRepository implements PartnerExpertiseRepository {
  listPartner(companyId: string, section: ExpertiseSection, locale: ExpertiseLocale) {
    return rpc<PartnerExpertiseVideo[]>("list_partner_expertise_videos", { p_company_id: companyId, p_section: section, p_locale: locale });
  }
  findPartner(companyId: string, videoId: string, locale: ExpertiseLocale) {
    return rpc<PartnerExpertiseVideo | null>("get_partner_expertise_video", { p_company_id: companyId, p_video_id: videoId, p_locale: locale });
  }
  listAdmin(section: ExpertiseSection | null, status: ExpertiseStatus | null) {
    return rpc<{ items: AdminExpertiseVideo[]; total: number }>("list_admin_partner_expertise_videos", { p_section: section, p_status: status, p_limit: 100, p_offset: 0 });
  }
  findAdmin(videoId: string) {
    return rpc<AdminExpertiseVideo | null>("get_admin_partner_expertise_video", { p_video_id: videoId });
  }
  save(input: ExpertiseVideoInput & { youtubeVideoId: string; canonicalUrl: string }) {
    return rpc<string>("save_admin_partner_expertise_video", {
      p_video_id: input.id,
      p_section: input.section,
      p_youtube_video_id: input.youtubeVideoId,
      p_youtube_url: input.canonicalUrl,
      p_title_ru: input.titleRu,
      p_title_ro: input.titleRo,
      p_description_ru: input.descriptionRu,
      p_description_ro: input.descriptionRo,
      p_sort_order: input.sortOrder,
      p_expected_revision: input.expectedRevision,
    });
  }
  async transition(videoId: string, action: "publish" | "unpublish" | "archive", revision: number) {
    await rpc("transition_admin_partner_expertise_video", { p_video_id: videoId, p_action: action, p_expected_revision: revision });
  }
}
