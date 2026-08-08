import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { ExternalDemandRepository } from "../demand.repository";
import type { ExternalDemandDetail, ExternalDemandState, ExternalDemandSummary } from "../../types";

export class SupabaseExternalDemandRepository implements ExternalDemandRepository {
  async setPartnerRequest(estimateId: string, estimateItemId: string, action: "request" | "cancel") {
    return this.call<ExternalDemandState>("set_partner_external_item_request", { target_estimate_id: estimateId, target_estimate_item_id: estimateItemId, target_action: action });
  }

  async listAdmin(input: Parameters<ExternalDemandRepository["listAdmin"]>[0]) {
    const result = await this.call<{ items?: ExternalDemandSummary[]; total?: number }>("list_admin_external_demand", {
      search_query: input.search ?? null,
      status_filter: input.status ?? null,
      result_limit: input.limit,
      result_offset: input.offset,
    });
    return { items: result.items ?? [], total: Number(result.total ?? 0) };
  }

  getAdminDetail(externalItemId: string) {
    return this.call<ExternalDemandDetail | null>("get_admin_external_demand_detail", { target_external_item_id: externalItemId });
  }

  searchAdminProducts(query: string, limit: number) {
    return this.call<Array<{ id: string; sku: string; name: string }>>("search_admin_external_demand_products", { search_query: query, result_limit: limit });
  }

  transition(input: Parameters<ExternalDemandRepository["transition"]>[0]) {
    return this.call<ExternalDemandState>("transition_external_item_request", {
      target_request_id: input.requestId,
      expected_version: input.expectedVersion,
      target_status: input.status,
      target_response_type: input.responseType ?? null,
      target_catalog_product_id: input.catalogProductId ?? null,
    });
  }

  curate(sourceItemId: string, canonicalItemId: string, reason: string) {
    return this.call<string>("curate_external_nomenclature_duplicate", { source_item_id: sourceItemId, target_canonical_item_id: canonicalItemId, curation_reason: reason });
  }

  private async call<T>(operation: string, input: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await createClient()).rpc(operation, input);
    if (error || data === null) throw new RepositoryUnexpectedError({ operation, table: "estimate_external_item_requests", payloadKeys: Object.keys(input), cause: error });
    return data as T;
  }
}
