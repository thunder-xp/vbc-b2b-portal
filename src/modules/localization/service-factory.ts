import "server-only";

import { SupabasePublicRetailPublicationRepository } from "../public-retail/repositories/supabase/public-retail-publication.supabase-repository";
import { PublicRetailPublicationService } from "../public-retail/services/public-retail-publication.service";
import { LocalizationService } from "./localization.service";
import { SupabaseLocalizationRepository } from "./supabase-localization.repository";
import { createConfiguredTranslationProvider } from "./translation-provider";

export function createLocalizationService(includeProvider = false) {
  return new LocalizationService(
    new SupabaseLocalizationRepository(),
    includeProvider ? createConfiguredTranslationProvider() ?? undefined : undefined,
    includeProvider ? new PublicRetailPublicationService(new SupabasePublicRetailPublicationRepository()) : undefined,
  );
}
