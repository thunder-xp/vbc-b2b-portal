import "server-only";

import { PartnerExpertiseService } from "./service";
import { SupabasePartnerExpertiseRepository } from "./supabase.repository";

export function getPartnerExpertiseService(): PartnerExpertiseService {
  return new PartnerExpertiseService(new SupabasePartnerExpertiseRepository());
}
