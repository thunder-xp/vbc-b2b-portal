import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { withBoundedSerializationRetry } from "@/src/lib/database/serialization-retry";

import type { EstimateVersion, ProposalSettings, ProposalTemplate } from "../../types";
import type { EstimateCartConversionEvidence, EstimateLifecycleRepository } from "../lifecycle.repository";
import { EstimateLifecycleRepositoryError } from "../lifecycle.repository";
import { mapEstimateRow, type EstimateRow } from "./mappers";

type VersionRow = {
  id: string;
  estimate_id: string;
  company_id: string;
  version_number: number;
  estimate_revision: number;
  status: EstimateVersion["status"];
  estimate_number: string;
  currency_code: string;
  total_amount: number | string;
  snapshot: EstimateVersion["snapshot"];
  customer_proposal_snapshot: EstimateVersion["customerProposalSnapshot"];
  proposal_template_id: string | null;
  note: string | null;
  change_reason: string | null;
  created_by: string;
  creator?: Array<{ full_name: string | null }> | null;
  created_at: string;
  sent_at: string | null;
  sent_channel: EstimateVersion["sentChannel"];
  accepted_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  rejection_reason_code: EstimateVersion["rejectionReasonCode"];
};

type TemplateRow = { id: string; company_id: string | null; template_key: string; name: string; configuration: ProposalSettings; is_system: boolean };
type ConversionRow = {
  version_id: string | null;
  created_by: string;
  direction: EstimateCartConversionEvidence["direction"];
  cart: null | {
    id: string;
    company_id: string;
    created_by: string;
    status: NonNullable<EstimateCartConversionEvidence["cart"]>["status"];
    items: Array<{ product_id: string; quantity: number | string }>;
  } | Array<{
    id: string;
    company_id: string;
    created_by: string;
    status: NonNullable<EstimateCartConversionEvidence["cart"]>["status"];
    items: Array<{ product_id: string; quantity: number | string }>;
  }>;
};

const VERSION_COLUMNS = "id, estimate_id, company_id, version_number, estimate_revision, status, estimate_number, currency_code, total_amount, snapshot, customer_proposal_snapshot, proposal_template_id, note, change_reason, created_by, created_at, sent_at, sent_channel, accepted_at, rejected_at, rejection_reason, rejection_reason_code";
const VERSION_LIST_COLUMNS = `${VERSION_COLUMNS}, creator:user_profiles!estimate_versions_created_by_fkey(full_name)`;

export class SupabaseEstimateLifecycleRepository implements EstimateLifecycleRepository {
  async listVersions(estimateId: string): Promise<EstimateVersion[]> {
    const { data, error } = await (await createClient()).from("estimate_versions").select(VERSION_LIST_COLUMNS)
      .eq("estimate_id", estimateId).order("version_number", { ascending: false });
    if (error) throw new EstimateLifecycleRepositoryError(error.code);
    return ((data ?? []) as VersionRow[]).map(mapVersion);
  }

  async findVersion(versionId: string): Promise<EstimateVersion | null> {
    const { data, error } = await (await createClient()).from("estimate_versions").select(VERSION_COLUMNS)
      .eq("id", versionId).maybeSingle();
    if (error) throw new EstimateLifecycleRepositoryError(error.code);
    return data ? mapVersion(data as VersionRow) : null;
  }

  async listLatestDocuments(versionIds: string[]) {
    if (!versionIds.length) return new Map();
    const { data, error } = await (await createClient()).from("generated_estimate_documents")
      .select("id, version_id, status, created_at").in("version_id", versionIds).order("created_at", { ascending: false });
    if (error) throw new EstimateLifecycleRepositoryError(error.code);
    const result = new Map<string, { id: string; status: "queued" | "generating" | "ready" | "failed" }>();
    for (const row of data ?? []) if (row.version_id && !result.has(row.version_id)) result.set(row.version_id, { id: row.id, status: row.status });
    return result;
  }

  async listVersionCartConversions(estimateId: string, versionId: string): Promise<EstimateCartConversionEvidence[]> {
    const { data, error } = await (await createClient()).from("estimate_cart_conversions")
      .select("version_id, created_by, direction, cart:carts!estimate_cart_conversions_cart_id_fkey(id, company_id, created_by, status, items:cart_items!cart_items_cart_id_fkey(product_id, quantity))")
      .eq("estimate_id", estimateId)
      .eq("version_id", versionId)
      .eq("direction", "estimate_to_cart")
      .order("created_at", { ascending: false });
    if (error) throw new EstimateLifecycleRepositoryError(error.code);
    return ((data ?? []) as unknown as ConversionRow[]).map((row) => {
      const cart = Array.isArray(row.cart) ? row.cart[0] ?? null : row.cart;
      return {
        versionId: row.version_id,
        createdBy: row.created_by,
        direction: row.direction,
        cart: cart ? {
          id: cart.id,
          companyId: cart.company_id,
          createdBy: cart.created_by,
          status: cart.status,
          items: cart.items.map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) })),
        } : null,
      };
    });
  }

  async createVersion(input: Parameters<EstimateLifecycleRepository["createVersion"]>[0]) {
    const { data, error } = await withBoundedSerializationRetry(async () => {
      const response = await (await createClient()).rpc("create_estimate_version_v2", {
        target_estimate_id: input.estimateId,
        expected_revision: input.expectedRevision,
        target_request_key: input.requestKey,
        target_request_fingerprint: input.requestFingerprint,
        target_note: input.note,
        target_change_reason: input.changeReason,
        target_customer_snapshot: input.customerProposalSnapshot,
      });
      if (response.error?.code === "40001") throw response.error;
      return response;
    });
    if (error || !data) throw new EstimateLifecycleRepositoryError(error?.code ?? null);
    const result = data as { status?: unknown; version?: unknown; repeated?: unknown; currentRevision?: unknown; code?: unknown };
    if (result.status === "conflict" && result.code === "ESTIMATE_VERSION_CONFLICT") {
      return { status: "conflict" as const, currentRevision: Number(result.currentRevision), code: "ESTIMATE_VERSION_CONFLICT" as const };
    }
    if (result.status !== "created" || !result.version) throw new EstimateLifecycleRepositoryError("invalid_response");
    return { status: "created" as const, version: mapVersion(result.version as VersionRow), repeated: result.repeated === true };
  }

  async markReady(estimateId: string, expectedRevision: number) {
    return this.estimateRpc("mark_estimate_ready", { target_estimate_id: estimateId, expected_revision: expectedRevision });
  }

  async transitionVersion(input: Parameters<EstimateLifecycleRepository["transitionVersion"]>[0]) {
    return this.versionRpc("transition_estimate_version_v2", {
      target_version_id: input.versionId,
      target_status: input.status,
      target_channel: input.channel ?? null,
      target_note: input.note ?? null,
      target_rejection_reason: input.rejectionReason ?? null,
    });
  }

  async restoreDraft(versionId: string, prices: Parameters<EstimateLifecycleRepository["restoreDraft"]>[1]) {
    return this.estimateRpc("restore_estimate_draft_from_version", {
      target_version_id: versionId,
      target_product_prices: prices.map((price) => ({
        product_id: price.productId,
        amount: price.amount,
        currency_code: price.currencyCode,
        snapshot_at: price.snapshotAt,
        converted_price: price.convertedPrice,
        exchange_rate: price.exchangeRate,
        exchange_rate_date: price.exchangeRateDate,
      })),
    });
  }

  async duplicate(estimateId: string) {
    return this.estimateRpc("duplicate_estimate", { target_estimate_id: estimateId });
  }

  async createTemplate(input: Parameters<EstimateLifecycleRepository["createTemplate"]>[0]) {
    const { data, error } = await (await createClient()).rpc("create_proposal_template_from_estimate", {
      target_estimate_id: input.estimateId,
      target_name: input.name,
      include_service_lines: input.includeServiceLines,
    });
    if (error || !data) throw new EstimateLifecycleRepositoryError(error?.code ?? null);
    return mapTemplate(data as TemplateRow);
  }

  async createFromCart(input: Parameters<EstimateLifecycleRepository["createFromCart"]>[0]) {
    return this.estimateRpc("create_estimate_from_cart", {
      target_cart_id: input.cartId,
      target_name: input.name,
      target_currency_code: input.currencyCode,
      target_request_key: input.requestKey,
      target_lines: input.lines.map((line) => ({
        product_id: line.productId,
        position: line.position,
        sku: line.sku,
        product_name: line.productName,
        quantity: line.quantity,
        partner_price: line.partnerPrice,
        currency_code: line.currencyCode,
        snapshot_at: line.snapshotAt,
        converted_price: line.convertedPrice,
        exchange_rate: line.exchangeRate,
        exchange_rate_date: line.exchangeRateDate,
      })),
    });
  }

  private async versionRpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error || !data) throw new EstimateLifecycleRepositoryError(error?.code ?? null);
    return mapVersion(data as VersionRow);
  }

  private async estimateRpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error || !data) throw new EstimateLifecycleRepositoryError(error?.code ?? null);
    return mapEstimateRow(data as EstimateRow);
  }
}

function mapVersion(row: VersionRow): EstimateVersion {
  return {
    id: row.id, estimateId: row.estimate_id, companyId: row.company_id, versionNumber: row.version_number,
    estimateRevision: row.estimate_revision, status: row.status, estimateNumber: row.estimate_number,
    currencyCode: row.currency_code, totalAmount: Number(row.total_amount), snapshot: row.snapshot,
    customerProposalSnapshot: row.customer_proposal_snapshot, proposalTemplateId: row.proposal_template_id,
    note: row.note, changeReason: row.change_reason, createdBy: row.created_by,
    createdByName: row.creator?.[0]?.full_name?.trim() || null, createdAt: row.created_at,
    sentAt: row.sent_at, sentChannel: row.sent_channel, acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at, rejectionReason: row.rejection_reason,
    rejectionReasonCode: row.rejection_reason_code,
  };
}

function mapTemplate(row: TemplateRow): ProposalTemplate {
  return { id: row.id, companyId: row.company_id, key: row.template_key, name: row.name, configuration: row.configuration, isSystem: row.is_system };
}
