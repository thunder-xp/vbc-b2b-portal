import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type {
  CompanyCompetitiveIntelligenceData,
  CompetitiveIntelligenceDashboard,
} from "./types";

export class CommercialIntelligenceRepository {
  async getDashboard(limit = 50): Promise<CompetitiveIntelligenceDashboard> {
    const { data, error } = await (await createClient()).rpc(
      "get_admin_competitive_intelligence",
      { p_limit: limit, p_offset: 0 },
    );
    if (error || !isDashboard(data)) {
      throw new Error("Competitive intelligence is unavailable.");
    }
    return data;
  }

  async getCompany(companyId: string, limit = 50): Promise<CompanyCompetitiveIntelligenceData | null> {
    const { data, error } = await (await createClient()).rpc(
      "get_admin_company_competitive_intelligence",
      { p_company_id: companyId, p_limit: limit },
    );
    if (error?.code === "42501") return null;
    if (error || !isCompanyView(data)) {
      throw new Error("Company competitive intelligence is unavailable.");
    }
    return data;
  }
}

function isDashboard(value: unknown): value is CompetitiveIntelligenceDashboard {
  if (!isRecord(value) || !isRecord(value.counts)) return false;
  return Array.isArray(value.products)
    && Array.isArray(value.partners)
    && Number.isFinite(Number(value.counts.productsUnderPressure))
    && Number.isFinite(Number(value.counts.partnersExposed))
    && Number.isFinite(Number(value.counts.lowConfidenceProducts));
}

function isCompanyView(value: unknown): value is CompanyCompetitiveIntelligenceData {
  return isRecord(value) && Array.isArray(value.items);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
