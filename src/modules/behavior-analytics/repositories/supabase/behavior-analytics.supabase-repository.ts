import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type {
  BehaviorAnalyticsPreview,
  RecordBehaviorEventInput,
} from "../../types";
import {
  BehaviorAnalyticsRepositoryError,
  type BehaviorAnalyticsRepository,
} from "../behavior-analytics.repository";

export class SupabaseBehaviorAnalyticsRepository
  implements BehaviorAnalyticsRepository
{
  async record(
    companyId: string,
    input: RecordBehaviorEventInput,
  ): Promise<string> {
    const supabase = await createClient();
    const momentumEvent = input.eventName === "purchasing_dynamics_opened" || input.eventName.startsWith("momentum_");
    const { data, error } = momentumEvent
      ? await supabase.rpc("record_partner_momentum_behavior_event", {
        p_company_id: companyId,
        p_event_name: input.eventName,
        p_session_id: input.sessionId,
        p_route: input.route,
        p_source_surface: input.sourceSurface ?? null,
        p_metadata_safe: input.metadataSafe ?? {},
      })
      : await supabase.rpc("record_partner_behavior_event", {
        p_company_id: companyId,
        p_event_name: input.eventName,
        p_session_id: input.sessionId,
        p_product_id: input.productId ?? null,
        p_category_id: input.categoryId ?? null,
        p_brand_id: input.brandId ?? null,
        p_route: input.route,
        p_search_query: input.searchQuery ?? null,
        p_result_count: input.resultCount ?? null,
        p_quantity: input.quantity ?? null,
        p_source_surface: input.sourceSurface ?? null,
        p_metadata_safe: input.metadataSafe ?? {},
      });
    if (error || typeof data !== "string") {
      throw new BehaviorAnalyticsRepositoryError(error?.code);
    }
    return data;
  }

  async getAdminPreview(
    days: number,
    limit: number,
  ): Promise<BehaviorAnalyticsPreview> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_admin_behavior_analytics",
      { p_days: days, p_limit: limit },
    );
    if (error || !isPreview(data)) {
      throw new BehaviorAnalyticsRepositoryError(error?.code);
    }
    return data;
  }
}

function isPreview(value: unknown): value is BehaviorAnalyticsPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<BehaviorAnalyticsPreview>;
  return typeof preview.periodDays === "number"
    && typeof preview.eventCount === "number"
    && typeof preview.sufficientVolume === "boolean"
    && Array.isArray(preview.products)
    && Array.isArray(preview.searchGaps)
    && Array.isArray(preview.categories)
    && Array.isArray(preview.merchandising);
}
