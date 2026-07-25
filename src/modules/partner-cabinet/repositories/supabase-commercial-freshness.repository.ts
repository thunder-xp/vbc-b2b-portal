import { createClient } from "@/src/lib/supabase/server";

import type { CommercialFreshnessDomain, CommercialFreshnessReadModel, CommercialFreshnessRecord } from "./commercial-freshness.repository";

const DOMAINS = new Set<CommercialFreshnessDomain>(["rates", "prices", "stock", "arrivals"]);

export class SupabaseCommercialFreshnessReadModel implements CommercialFreshnessReadModel {
  async getFreshness(): Promise<CommercialFreshnessRecord[]> {
    const client = await createClient();
    const { data, error } = await client.rpc("get_partner_commercial_freshness");
    if (error) throw new Error("Commercial freshness is unavailable.");
    if (!Array.isArray(data)) return [];

    return data.flatMap((row: unknown) => {
      if (!isRecord(row) || typeof row.domain !== "string" || !DOMAINS.has(row.domain as CommercialFreshnessDomain)) return [];
      return [{ domain: row.domain as CommercialFreshnessDomain, updatedAt: typeof row.updated_at === "string" ? row.updated_at : null }];
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
