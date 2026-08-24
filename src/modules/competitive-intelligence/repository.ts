import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type {
  CompetitiveEvidenceDescriptor,
  CompetitiveObservationReceipt,
  CompetitiveWindowDays,
  CompetitorIntelligenceProfile,
  MarketIntelligenceDashboard,
  PartnerProductCompetitiveIntelligence,
  ProductMarketIntelligenceProfile,
} from "./types";

type JsonRecord = Record<string, unknown>;

export class CompetitiveIntelligenceRepositoryError extends Error {
  constructor(public readonly code: string | null, message = "Competitive intelligence operation failed.") {
    super(message);
    this.name = "CompetitiveIntelligenceRepositoryError";
  }
}

export class CompetitiveIntelligenceRepository {
  async getPartnerProduct(companyId: string, productId: string, windowDays: CompetitiveWindowDays = 30) {
    const { data, error } = await (await createClient()).rpc("get_partner_product_competitive_intelligence", {
      p_company_id: companyId,
      p_product_id: productId,
      p_window_days: windowDays,
      p_limit: 30,
    });
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as PartnerProductCompetitiveIntelligence;
  }

  async createObservation(input: JsonRecord): Promise<CompetitiveObservationReceipt> {
    const { data, error } = await (await createClient()).rpc("create_competitor_price_observation", input);
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as CompetitiveObservationReceipt;
  }

  async getAdminDashboard(windowDays: CompetitiveWindowDays = 30) {
    const { data, error } = await (await createClient()).rpc("get_admin_market_intelligence", {
      p_window_days: windowDays,
      p_limit: 100,
      p_offset: 0,
    });
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as MarketIntelligenceDashboard;
  }

  async getCompetitorProfile(competitorId: string, windowDays: CompetitiveWindowDays = 30) {
    const { data, error } = await (await createClient()).rpc("get_admin_competitor_intelligence", {
      p_competitor_id: competitorId,
      p_window_days: windowDays,
    });
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as CompetitorIntelligenceProfile;
  }

  async getProductProfile(productId: string, windowDays: CompetitiveWindowDays = 30) {
    const { data, error } = await (await createClient()).rpc("get_admin_product_market_intelligence", {
      p_product_id: productId,
      p_window_days: windowDays,
    });
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as ProductMarketIntelligenceProfile;
  }

  async reconcileCompetitor(input: { queueId: string; competitorId: string | null; canonicalName: string | null; reason: string }) {
    const { data, error } = await (await createClient()).rpc("admin_reconcile_competitive_intelligence_competitor", {
      p_queue_id: input.queueId,
      p_competitor_id: input.competitorId,
      p_canonical_name: input.canonicalName,
      p_reason: input.reason,
    });
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.code);
    return data;
  }

  async reviewObservation(observationId: string, decision: string, reason: string) {
    const { data, error } = await (await createClient()).rpc("admin_review_competitive_price_observation", {
      p_observation_id: observationId,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.code);
    return data;
  }

  async acknowledgeRecommendation(recommendationId: string, action: string, reason: string) {
    const { error } = await (await createClient()).rpc("admin_acknowledge_competitive_recommendation", {
      p_recommendation_id: recommendationId,
      p_action: action,
      p_reason: reason,
    });
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.code);
  }

  async reviewSignal(signalId: string, action: string, reason: string) {
    const { data, error } = await (await createClient()).rpc("admin_review_competitive_signal", {
      p_signal_id: signalId,
      p_action: action,
      p_reason: reason,
    });
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.code);
    return data;
  }

  async getEvidenceDescriptor(companyId: string | null, evidenceId: string) {
    const { data, error } = await (await createClient()).rpc("get_competitive_intelligence_evidence_descriptor", {
      p_company_id: companyId,
      p_evidence_id: evidenceId,
    });
    if (error || !isRecord(data)) throw new CompetitiveIntelligenceRepositoryError(error?.code ?? null);
    return data as unknown as CompetitiveEvidenceDescriptor;
  }

  async uploadEvidence(key: string, bytes: Uint8Array, mimeType: string) {
    const { error } = await createAdminClient().storage.from("competitive-intelligence-evidence").upload(key, bytes, {
      cacheControl: "private, max-age=0, no-store",
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.name, "Evidence upload failed.");
  }

  async removeEvidence(key: string) {
    await createAdminClient().storage.from("competitive-intelligence-evidence").remove([key]);
  }

  async downloadEvidence(descriptor: CompetitiveEvidenceDescriptor) {
    const { data, error } = await createAdminClient().storage.from(descriptor.bucket).download(descriptor.key);
    if (error) throw new CompetitiveIntelligenceRepositoryError(error.name, "Evidence download failed.");
    return new Uint8Array(await data.arrayBuffer());
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
