import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";
import { createClient } from "@/src/lib/supabase/server";

import type { RetailMarketplaceRepository } from "../retail-marketplace.repository";
import { adminReportSchema, publicProvidersSchema, tariffSetSchema } from "../../validation";

export class RetailMarketplaceRepositoryError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "forbidden" | "unavailable" = "unavailable") { super("Retail Marketplace operation failed."); this.name = "RetailMarketplaceRepositoryError"; }
}
function fail(code?: string): never { throw new RetailMarketplaceRepositoryError(code === "22023" ? "invalid" : code === "40001" || code === "23505" ? "conflict" : code === "42501" ? "forbidden" : "unavailable"); }

export class SupabaseRetailMarketplaceRepository implements RetailMarketplaceRepository {
  async getCurrentTariffs(systemType: "cctv") {
    const { data, error } = await createPublicReadClient().rpc("get_current_public_installation_tariffs", { p_system_type: systemType });
    if (error) fail(error.code); return data ? tariffSetSchema.parse(data) : null;
  }
  async listPublicProviders(systemType: "cctv", regionCode: string, locale: "ru" | "ro") {
    const { data, error } = await createPublicReadClient().rpc("list_public_installation_providers", { p_system_type: systemType, p_region_code: regionCode, p_locale: locale });
    if (error) fail(error.code); return publicProvidersSchema.parse(data);
  }
  async getAdminReport() {
    const { data, error } = await (await createClient()).rpc("admin_get_retail_installation_marketplace");
    if (error) fail(error.code); return adminReportSchema.parse(data);
  }
  async saveTariffDraft(input: Parameters<RetailMarketplaceRepository["saveTariffDraft"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_save_installation_tariff_draft", { p_tariff_set_id: input.tariffSetId, p_effective_from: input.effectiveFrom, p_currency: input.currency, p_vat_treatment: input.vatTreatment, p_lines: input.lines, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error || !data) fail(error?.code); return String(data);
  }
  async publishTariff(input: Parameters<RetailMarketplaceRepository["publishTariff"]>[0]) {
    const { error } = await (await createClient()).rpc("admin_publish_installation_tariff_set", { p_tariff_set_id: input.tariffSetId, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error) fail(error.code);
  }
  async saveProvider(input: Parameters<RetailMarketplaceRepository["saveProvider"]>[0]) {
    const { data, error } = await (await createClient()).rpc("admin_save_installation_provider", { p_provider_id: input.providerId, p_provider_type: input.providerType, p_backing_id: input.backingId, p_profile: input.profile, p_competencies: input.competencies, p_region_codes: input.regionCodes, p_expected_revision: input.expectedRevision, p_reason: input.reason });
    if (error || !data) fail(error?.code); return String(data);
  }
}
