import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { SupabasePublicRetailPublicationRepository } from "../../public-retail/repositories/supabase/public-retail-publication.supabase-repository";
import { PublicRetailPublicationService } from "../../public-retail/services/public-retail-publication.service";
import { CatalogSynchronizationOrchestrator } from "../sync/catalog-synchronization-orchestrator";
import { SupabaseCatalogSynchronizationRunRepository } from "../sync/catalog-synchronization-run.repository";

export function createCatalogSynchronizationOrchestrator() {
  return new CatalogSynchronizationOrchestrator(
    new SupabaseCatalogSynchronizationRunRepository(),
    new PublicRetailPublicationService(new SupabasePublicRetailPublicationRepository()),
    {
      invalidateAfterPublication() {
        revalidateTag("public-retail-publication", "max");
        revalidatePath("/");
        revalidatePath("/catalog");
        revalidatePath("/products/[slug]", "page");
        revalidatePath("/sitemap.xml");
      },
    },
  );
}
