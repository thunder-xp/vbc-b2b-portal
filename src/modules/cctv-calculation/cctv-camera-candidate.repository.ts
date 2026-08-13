import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { CctvObjectType } from "./cctv-engine";
import type { CctvCameraCandidateRecord, CctvCameraCandidateSearchRow, CctvCameraPlacement,
  CctvCameraPoolAdminRow, CctvCameraPriority } from "./cctv-camera-selection";

export class SupabaseCctvCameraCandidateRepository {
  async resolve(objectType: CctvObjectType, placements: CctvCameraPlacement[], locale: "ru" | "ro" = "ru") {
    if (!placements.length) return [];
    const { data, error } = await createAdminClient().rpc("resolve_cctv_camera_candidate_pool", {
      target_object_type: objectType, target_placements: [...new Set(placements)], target_locale: locale,
    });
    if (error || !Array.isArray(data)) throw new Error("CCTV camera candidate pool is unavailable.");
    return data.map(parseCandidate);
  }

  async listAdmin(): Promise<CctvCameraPoolAdminRow[]> {
    const { data, error } = await (await createClient()).rpc("list_cctv_camera_candidate_pools");
    if (error) throw new Error("CCTV camera pools are unavailable.");
    return (data ?? []).map((row: Record<string, unknown>) => ({
      candidateId: String(row.id), objectType: String(row.object_type) as CctvObjectType,
      placement: row.placement_type as CctvCameraPlacement, productId: String(row.product_id),
      manualPriority: row.manual_priority as CctvCameraPriority, enabled: row.enabled === true,
      resolutionMp: Number(row.resolution_mp), networkCamera: row.network_camera === true,
      poeSupported: booleanOrNull(row.poe_supported), colorNight: booleanOrNull(row.color_night),
      anpr: booleanOrNull(row.anpr), videoAnalytics: booleanOrNull(row.video_analytics),
      technicalVerified: row.technical_verified === true, availableStock: Number(row.available_stock ?? 0),
      recentSalesQty: Number(row.recent_sales_qty ?? 0), lastSaleAt: stringOrNull(row.last_sale_at),
      signalUpdatedAt: stringOrNull(row.signal_updated_at), sku: String(row.sku), name: String(row.product_name),
      imageUrl: stringOrNull(row.image_url), publicProduct: null, notes: stringOrNull(row.notes), version: Number(row.version),
      evidenceSource: stringOrNull(row.evidence_source), publicPublished: row.public_published === true,
      retailPriceAmount: numberOrNull(row.retail_price_amount), retailPriceCurrency: stringOrNull(row.retail_price_currency),
    }));
  }

  async searchAdmin(input: { query: string; objectType: CctvObjectType; placement: CctvCameraPlacement;
    limit?: number }): Promise<CctvCameraCandidateSearchRow[]> {
    const { data, error } = await (await createClient()).rpc("search_cctv_camera_candidates", {
      search_query: input.query,
      target_object_type: input.objectType,
      target_placement_type: input.placement,
      result_limit: Math.min(20, Math.max(1, input.limit ?? 12)),
    });
    if (error) throw new Error("CCTV camera candidate search is unavailable.");
    return (data ?? []).map((row: Record<string, unknown>) => ({
      productId: String(row.product_id), sku: String(row.sku), name: String(row.product_name),
      imageUrl: stringOrNull(row.image_url), resolutionMp: Number(row.resolution_mp),
      colorNight: booleanOrNull(row.color_night), anpr: booleanOrNull(row.anpr),
      videoAnalytics: booleanOrNull(row.video_analytics), technicalVerified: row.technical_verified === true,
      availableStock: Number(row.available_stock ?? 0), recentSalesQty: Number(row.recent_sales_qty ?? 0),
      retailPriceAmount: numberOrNull(row.retail_price_amount), retailPriceCurrency: stringOrNull(row.retail_price_currency),
      alreadyInPool: row.already_in_pool === true,
    }));
  }

  async upsertAdmin(input: { objectType: CctvObjectType; placement: CctvCameraPlacement; productId: string;
    manualPriority: CctvCameraPriority; enabled: boolean; notes: string; expectedVersion: number | null }) {
    const { data, error } = await (await createClient()).rpc("upsert_cctv_camera_candidate", {
      target_object_type: input.objectType, target_placement_type: input.placement, target_product_id: input.productId,
      target_manual_priority: input.manualPriority, target_enabled: input.enabled, target_notes: input.notes,
      expected_version: input.expectedVersion,
    });
    if (error || !data?.[0]) throw new Error(error?.code === "PT409" ? "CCTV_CAMERA_POOL_CONFLICT" : "CCTV camera candidate could not be saved.");
    return { candidateId: String(data[0].candidate_id), version: Number(data[0].resulting_version) };
  }

  async removeAdmin(candidateId: string, expectedVersion: number) {
    const { data, error } = await (await createClient()).rpc("remove_cctv_camera_candidate", {
      target_candidate_id: candidateId, expected_version: expectedVersion,
    });
    if (error || data == null) throw new Error(error?.code === "PT409" ? "CCTV_CAMERA_POOL_CONFLICT" : "CCTV camera candidate could not be removed.");
    return Number(data);
  }
}

function parseCandidate(value: unknown): CctvCameraCandidateRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid CCTV camera candidate.");
  const row = value as Record<string, unknown>;
  const priority = row.manualPriority;
  const placement = row.placement;
  if ((priority !== "high" && priority !== "normal" && priority !== "low")
    || (placement !== "indoor" && placement !== "outdoor")) throw new Error("Invalid CCTV camera candidate.");
  return {
    candidateId: String(row.candidateId), objectType: String(row.objectType) as CctvObjectType,
    placement, productId: String(row.productId), manualPriority: priority as CctvCameraPriority,
    enabled: row.enabled === true, resolutionMp: Number(row.resolutionMp), networkCamera: row.networkCamera === true,
    poeSupported: booleanOrNull(row.poeSupported), colorNight: booleanOrNull(row.colorNight),
    anpr: booleanOrNull(row.anpr), videoAnalytics: booleanOrNull(row.videoAnalytics),
    technicalVerified: row.technicalVerified === true, availableStock: Number(row.availableStock ?? 0),
    recentSalesQty: Number(row.recentSalesQty ?? 0), lastSaleAt: stringOrNull(row.lastSaleAt),
    signalUpdatedAt: stringOrNull(row.signalUpdatedAt), sku: String(row.sku), name: String(row.name),
    imageUrl: stringOrNull(row.imageUrl), publicProduct: row.publicProduct ?? null,
  };
}
function booleanOrNull(value: unknown) { return typeof value === "boolean" ? value : null; }
function stringOrNull(value: unknown) { return typeof value === "string" ? value : null; }
function numberOrNull(value: unknown) { return value === null || value === undefined ? null : Number(value); }
