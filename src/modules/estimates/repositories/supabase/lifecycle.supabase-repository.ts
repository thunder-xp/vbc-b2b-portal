import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type { EstimateVersion, ProposalSettings, ProposalTemplate } from "../../types";
import type { EstimateLifecycleRepository } from "../lifecycle.repository";
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
};

type TemplateRow = { id: string; company_id: string | null; template_key: string; name: string; configuration: ProposalSettings; is_system: boolean };

const VERSION_COLUMNS = "id, estimate_id, company_id, version_number, estimate_revision, status, estimate_number, currency_code, total_amount, snapshot, customer_proposal_snapshot, proposal_template_id, note, change_reason, created_by, created_at, sent_at, sent_channel, accepted_at, rejected_at, rejection_reason";
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

  async createVersion(input: Parameters<EstimateLifecycleRepository["createVersion"]>[0]) {
    return this.versionRpc("create_estimate_version", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      target_note: input.note,
      target_change_reason: input.changeReason,
      target_customer_snapshot: input.customerProposalSnapshot,
    });
  }

  async markReady(estimateId: string, expectedRevision: number) {
    return this.estimateRpc("mark_estimate_ready", { target_estimate_id: estimateId, expected_revision: expectedRevision });
  }

  async transitionVersion(input: Parameters<EstimateLifecycleRepository["transitionVersion"]>[0]) {
    return this.versionRpc("transition_estimate_version", {
      target_version_id: input.versionId,
      target_status: input.status,
      target_channel: input.channel ?? null,
      target_note: input.note ?? null,
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
  };
}

function mapTemplate(row: TemplateRow): ProposalTemplate {
  return { id: row.id, companyId: row.company_id, key: row.template_key, name: row.name, configuration: row.configuration, isSystem: row.is_system };
}
