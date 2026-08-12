import "server-only";

import { cache } from "react";

import { SupabasePublicRetailReadRepository } from "./repositories/supabase/public-retail.supabase-repository";
import { PublicCctvCalculatorService } from "./services/public-cctv-calculator.service";
import { PublicRetailService } from "./services/public-retail.service";
import type { PublicRetailLocale } from "./types";

const service = new PublicRetailService(new SupabasePublicRetailReadRepository());
const calculator = new PublicCctvCalculatorService(new SupabasePublicRetailReadRepository());

export function getPublicRetailService(): PublicRetailService {
  return service;
}
export function getPublicCctvCalculatorService(): PublicCctvCalculatorService {
  return calculator;
}
export const getPublicRetailProduct = cache((slug: string, locale: PublicRetailLocale) =>
  service.getRetailProduct(slug, locale));
