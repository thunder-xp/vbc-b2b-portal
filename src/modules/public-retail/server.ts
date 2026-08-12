import "server-only";

import { cache } from "react";

import { SupabasePublicRetailReadRepository } from "./repositories/supabase/public-retail.supabase-repository";
import { PublicRetailService } from "./services/public-retail.service";
import type { PublicRetailLocale } from "./types";

const service = new PublicRetailService(new SupabasePublicRetailReadRepository());

export function getPublicRetailService(): PublicRetailService {
  return service;
}
export const getPublicRetailProduct = cache((slug: string, locale: PublicRetailLocale) =>
  service.getRetailProduct(slug, locale));
