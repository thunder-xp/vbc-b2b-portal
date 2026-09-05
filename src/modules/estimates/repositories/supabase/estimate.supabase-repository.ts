import { createClient } from "@/src/lib/supabase/server";

import type {
  AddEstimateLineInput,
  CreateEstimateInput,
  EstimateListInput,
  EstimateListRecord,
  EstimateRepository,
  SaveEstimateCommercialInput,
} from "../estimate.repository";
import { EstimateRepositoryError } from "../estimate.repository";
import type { Estimate, EstimateAggregate, FinalCustomer, PartnerService } from "../../types";
import {
  mapEstimateAggregateRow,
  mapEstimateRow,
  mapPartnerServiceRow,
  type EstimateItemRow,
  type EstimateChargeRow,
  type EstimateRow,
  type EstimateSectionRow,
  type PartnerServiceRow,
} from "./mappers";

const ESTIMATE_COLUMNS = "id, company_id, created_by, estimate_number, name, final_customer_id, customer_name, project_name, currency_code, currency_rate, currency_rate_effective_date, validity_days, global_discount_percent, vat_mode, vat_rate_percent, subtotal_amount, line_discount_total, section_discount_total, global_discount_amount, charges_total, vat_amount, total_excluding_vat, gross_profit_amount, overall_margin_percent, status, lifecycle_status, lifecycle_sent_at, lifecycle_expires_at, lifecycle_accepted_at, lifecycle_rejected_at, lifecycle_rejection_reason, lifecycle_converted_at, lifecycle_order_id, total_amount, has_incomplete_pricing, proposal_template_id, proposal_settings, source_estimate_id, source_version_id, accepted_version_id, revision, archived_at, created_at, updated_at";
const SECTION_COLUMNS = "id, estimate_id, name, system_key, sort_order, show_subtotal, discount_percent, created_at, updated_at";
const ITEM_COLUMNS = "id, estimate_id, section_id, line_type, product_id, service_id, external_nomenclature_id, position, sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value, internal_cost_unit_price, converted_cost_unit_price, exchange_rate, exchange_rate_effective_date, line_discount_percent, description, quantity, unit, selling_unit_price, line_total, line_subtotal, line_discount_amount, net_line_total, created_at, updated_at, estimate_external_item_requests(id,status,version)";
const CHARGE_COLUMNS = "id, estimate_id, charge_type, description, amount, vat_applicable, customer_visible, sort_order, created_at, updated_at";

type EstimateListRow = EstimateRow & {
  estimate_items: Array<{ count: number }>;
  creator: { full_name: string | null } | null;
};

type EstimateAggregateRow = EstimateRow & {
  estimate_sections: EstimateSectionRow[];
  estimate_items: EstimateItemRow[];
  estimate_charges: EstimateChargeRow[];
};

export class SupabaseEstimateRepository implements EstimateRepository {
  async list(input: EstimateListInput): Promise<{ records: EstimateListRecord[]; totalCount: number }> {
    const supabase = await createClient();
    let versionEstimateIds: string[] | null = null;
    if (input.versionStatus) {
      const statuses = input.versionStatus === "has_sent" ? ["sent", "accepted", "rejected"] : [input.versionStatus];
      const { data: matchingVersions, error: matchingVersionError } = await supabase.from("estimate_versions")
        .select("estimate_id").eq("company_id", input.companyId).in("status", statuses);
      if (matchingVersionError) throw mapRepositoryError(matchingVersionError.code);
      versionEstimateIds = [...new Set((matchingVersions ?? []).map((version) => version.estimate_id))];
      if (!versionEstimateIds.length) return { records: [], totalCount: 0 };
    }
    let query = supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, estimate_items(count), creator:user_profiles!estimates_created_by_fkey(full_name)`, { count: "exact" })
      .eq("company_id", input.companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .range(input.offset, input.offset + input.limit - 1);

    if (input.status) query = query.eq("status", input.status);
    if (input.lifecycleStatus) query = query.eq("lifecycle_status", input.lifecycleStatus);
    if (versionEstimateIds) query = query.in("id", versionEstimateIds);
    if (input.dateFrom) query = query.gte("updated_at", input.dateFrom);
    if (input.dateTo) query = query.lt("updated_at", input.dateTo);
    if (input.search) {
      const pattern = `%${escapePostgrestPattern(input.search)}%`;
      query = query.or(`estimate_number.ilike.${pattern},name.ilike.${pattern},customer_name.ilike.${pattern},project_name.ilike.${pattern}`);
    }

    const { data, error, count } = await query;
    if (error) throw mapRepositoryError(error.code);

    const rows = data as unknown as EstimateListRow[];
    const estimateIds = rows.map((row) => row.id);
    const versionMetadata = new Map<string, { count: number; latest: import("../../types").EstimateVersionStatus | null; latestVersionId: string | null; hasProtectedVersion: boolean }>();
    const latestPdfByVersion = new Map<string, string>();
    const protectedEstimateIds = new Set<string>();
    if (estimateIds.length) {
      const [versionResult, deletionGuardResults] = await Promise.all([
        supabase.from("estimate_versions")
          .select("id, estimate_id, version_number, status").in("estimate_id", estimateIds).order("version_number", { ascending: false }),
        input.status === "archived"
          ? Promise.all([
            supabase.from("estimate_cart_conversions").select("estimate_id").in("estimate_id", estimateIds),
            supabase.from("estimate_proposal_deliveries").select("estimate_id").in("estimate_id", estimateIds),
            supabase.from("estimate_lifecycle_events").select("estimate_id, to_status").in("estimate_id", estimateIds).neq("to_status", "draft"),
          ])
          : Promise.resolve(null),
      ]);
      const { data: versions, error: versionError } = versionResult;
      if (versionError) throw mapRepositoryError(versionError.code);
      if (deletionGuardResults) {
        for (const result of deletionGuardResults) {
          if (result.error) throw mapRepositoryError(result.error.code);
          for (const dependency of result.data ?? []) protectedEstimateIds.add(dependency.estimate_id);
        }
      }
      for (const version of versions ?? []) {
        const current = versionMetadata.get(version.estimate_id) ?? { count: 0, latest: null, latestVersionId: null, hasProtectedVersion: false };
        versionMetadata.set(version.estimate_id, { count: current.count + 1, latest: current.latest ?? version.status, latestVersionId: current.latestVersionId ?? version.id, hasProtectedVersion: current.hasProtectedVersion || version.status !== "prepared" });
      }
      const versionIds = [...versionMetadata.values()].map((metadata) => metadata.latestVersionId).filter((id): id is string => Boolean(id));
      if (versionIds.length) {
        const { data: documents, error: documentError } = await supabase.from("generated_estimate_documents")
          .select("id, version_id, created_at").in("version_id", versionIds).eq("status", "ready").order("created_at", { ascending: false });
        if (documentError) throw mapRepositoryError(documentError.code);
        for (const document of documents ?? []) if (document.version_id && !latestPdfByVersion.has(document.version_id)) latestPdfByVersion.set(document.version_id, document.id);
      }
    }
    return {
      records: rows.map((row) => ({
        ...mapEstimateRow(row),
        itemCount: row.estimate_items[0]?.count ?? 0,
        createdByName: row.creator?.full_name?.trim() || "Пользователь компании",
        versionCount: versionMetadata.get(row.id)?.count ?? 0,
        latestVersionStatus: versionMetadata.get(row.id)?.latest ?? null,
        latestVersionId: versionMetadata.get(row.id)?.latestVersionId ?? null,
        latestPdfDocumentId: latestPdfByVersion.get(versionMetadata.get(row.id)?.latestVersionId ?? "") ?? null,
        hasAcceptedVersion: Boolean(row.accepted_version_id),
        canDeleteArchived: row.status === "archived"
          && row.lifecycle_status === "draft"
          && !row.lifecycle_order_id
          && !row.accepted_version_id
          && !versionMetadata.get(row.id)?.hasProtectedVersion
          && !protectedEstimateIds.has(row.id),
      })),
      totalCount: count ?? 0,
    };
  }

  async findAggregateById(estimateId: string): Promise<EstimateAggregate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .select(`${ESTIMATE_COLUMNS}, final_customer:partner_final_customers(id, display_name, primary_email, revision), estimate_sections(${SECTION_COLUMNS}), estimate_items(${ITEM_COLUMNS}), estimate_charges(${CHARGE_COLUMNS})`)
      .eq("id", estimateId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw mapRepositoryError(error.code);
    return data ? mapEstimateAggregateRow(data as unknown as EstimateAggregateRow) : null;
  }

  async findById(estimateId: string): Promise<Estimate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimates")
      .select(ESTIMATE_COLUMNS)
      .eq("id", estimateId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw mapRepositoryError(error.code);
    return data ? mapEstimateRow(data as EstimateRow) : null;
  }

  async create(input: CreateEstimateInput): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_estimate_v3", {
      target_company_id: input.companyId,
      estimate_name: input.name,
      target_final_customer_id: input.finalCustomerId,
      target_customer_name: input.customerName ?? "",
      target_project_name: input.projectName ?? "",
      target_currency_code: input.currencyCode,
      target_validity_days: input.validityDays,
      request_key: input.requestKey,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async searchFinalCustomers(companyId: string, query: string, limit: number): Promise<FinalCustomer[]> {
    const { data, error } = await (await createClient()).rpc("search_partner_final_customers", {
      target_company_id: companyId,
      search_query: query,
      result_limit: limit,
    });
    if (error) throw mapRepositoryError(error.code);
    return (data ?? []).map(mapFinalCustomerRow);
  }

  async listFinalCustomers(input: Parameters<NonNullable<EstimateRepository["listFinalCustomers"]>>[0]) {
    const { data, error } = await (await createClient()).rpc("list_partner_final_customers", {
      target_company_id: input.companyId,
      search_query: input.search ?? "",
      industry_filter: input.industryCode ?? null,
      result_limit: input.limit,
      result_offset: input.offset,
    });
    if (error) throw mapRepositoryError(error.code);
    const records = (data ?? []).map(mapFinalCustomerListRow);
    return { records, totalCount: records[0]?.totalCount ?? 0 };
  }

  async getFinalCustomerDetail(companyId: string, customerId: string, estimateLimit: number) {
    const { data, error } = await (await createClient()).rpc("get_partner_final_customer_detail", {
      target_company_id: companyId,
      target_customer_id: customerId,
      estimate_limit: estimateLimit,
    });
    if (error) throw mapRepositoryError(error.code);
    if (!data) return null;
    const payload = data as Record<string, unknown>;
    const customer = mapFinalCustomerRow(payload.customer as Record<string, unknown>);
    const estimates = Array.isArray(payload.estimates) ? payload.estimates as Record<string, unknown>[] : [];
    return {
      ...customer,
      lastActivityAt: typeof payload.last_activity_at === "string" ? payload.last_activity_at : null,
      estimates: estimates.map((row) => ({
        id: String(row.id),
        estimateNumber: String(row.estimate_number),
        name: String(row.name),
        projectName: typeof row.project_name === "string" ? row.project_name : null,
        status: row.status as import("../../types").EstimateLifecycleStatus,
        updatedAt: String(row.updated_at),
      })),
    };
  }

  async createFinalCustomer(input: Parameters<NonNullable<EstimateRepository["createFinalCustomer"]>>[0]): Promise<FinalCustomer> {
    const { data, error } = await (await createClient()).rpc("create_partner_final_customer_v2", {
      target_company_id: input.companyId,
      target_display_name: input.displayName,
      target_customer_type: input.customerType,
      target_fiscal_code: input.fiscalCode ?? "",
      target_locality: input.locality ?? "",
      target_industry_code: input.industryCode,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapFinalCustomerRow(data as Record<string, unknown>);
  }

  async updateFinalCustomer(input: Parameters<NonNullable<EstimateRepository["updateFinalCustomer"]>>[0]): Promise<FinalCustomer> {
    const { data, error } = await (await createClient()).rpc("update_partner_final_customer_v2", {
      target_company_id: input.companyId,
      target_customer_id: input.customerId,
      expected_revision: input.expectedRevision,
      target_display_name: input.displayName,
      target_customer_type: input.customerType,
      target_fiscal_code: input.fiscalCode ?? "",
      target_locality: input.locality ?? "",
      target_industry_code: input.industryCode,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapFinalCustomerRow(data as Record<string, unknown>);
  }

  async updateFinalCustomerEmail(input: Parameters<NonNullable<EstimateRepository["updateFinalCustomerEmail"]>>[0]): Promise<FinalCustomer> {
    const { data, error } = await (await createClient()).rpc("update_estimate_final_customer_email", {
      target_estimate_id: input.estimateId,
      target_customer_id: input.customerId,
      expected_revision: input.expectedRevision,
      target_primary_email: input.primaryEmail,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapFinalCustomerRow(data as Record<string, unknown>);
  }

  async archiveFinalCustomer(customerId: string, expectedRevision: number): Promise<void> {
    const { error } = await (await createClient()).rpc("archive_partner_final_customer", {
      target_customer_id: customerId,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async searchExternalNomenclature(companyId: string, query: string, itemType: import("../estimate.repository").ExternalNomenclatureItemType, scope: "own" | "shared", limit: number) {
    const { data, error } = await (await createClient()).rpc("search_external_nomenclature_v2", {
      target_company_id: companyId,
      search_query: query,
      target_item_type: itemType,
      search_scope: scope,
      result_limit: limit,
    });
    if (error) throw mapRepositoryError(error.code);
    return (data ?? []).map(mapExternalNomenclatureRow);
  }

  async listPartnerNomenclature(input: import("../estimate.repository").PartnerNomenclatureListInput) {
    const { data, error } = await (await createClient()).rpc("list_partner_external_nomenclature_v2", {
      target_company_id: input.companyId,
      search_query: input.search ?? null,
      target_item_type: input.itemType ?? null,
      result_limit: input.limit,
      result_offset: input.offset,
    });
    if (error) throw mapRepositoryError(error.code);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      records: rows.map((row) => ({
        ...mapExternalNomenclatureRow(row),
        lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
        createdAt: String(row.created_at),
        version: Number(row.version),
      })),
      totalCount: rows.length ? Number(rows[0].total_count) : 0,
    };
  }

  async createPartnerNomenclature(input: Parameters<NonNullable<EstimateRepository["createPartnerNomenclature"]>>[0]) {
    const { data, error } = await (await createClient()).rpc("create_partner_external_nomenclature", {
      target_company_id: input.companyId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      target_item_type: input.itemType,
      target_manufacturer: input.manufacturer ?? "",
      target_model: input.model ?? "",
      target_name: input.name,
      target_category: input.category ?? "",
      target_unit: input.unit,
      target_specification: input.specification ?? "",
      force_create_new: input.forceCreateNew,
    });
    if (error) throw mapRepositoryError(error.code);
    return String(data);
  }

  async updatePartnerNomenclature(input: Parameters<NonNullable<EstimateRepository["updatePartnerNomenclature"]>>[0]) {
    const { data, error } = await (await createClient()).rpc("update_partner_external_nomenclature", {
      target_company_id: input.companyId,
      target_external_nomenclature_id: input.itemId,
      expected_version: input.expectedVersion,
      target_name: input.name,
      target_category: input.category ?? "",
      target_unit: input.unit,
      target_specification: input.specification ?? "",
    });
    if (error) throw mapRepositoryError(error.code);
    return Number(data);
  }

  async archivePartnerNomenclature(companyId: string, itemId: string, expectedVersion: number) {
    const { error } = await (await createClient()).rpc("archive_partner_external_nomenclature", {
      target_company_id: companyId,
      target_external_nomenclature_id: itemId,
      expected_version: expectedVersion,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async adoptPartnerNomenclature(companyId: string, itemId: string) {
    const { error } = await (await createClient()).rpc("adopt_partner_external_nomenclature", { target_company_id: companyId, target_external_nomenclature_id: itemId });
    if (error) throw mapRepositoryError(error.code);
  }

  async addExternalLine(input: import("../estimate.repository").AddExternalEstimateLineInput): Promise<void> {
    const { error } = await (await createClient()).rpc("add_estimate_external_item_v3", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      target_section_id: input.targetSectionId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      existing_external_item_id: input.existingExternalItemId,
      target_manufacturer: input.manufacturer,
      target_model: input.model,
      target_name: input.name,
      target_category: input.category ?? "",
      target_unit: input.unit,
      target_specification: input.specification ?? "",
      target_quantity: input.quantity,
      target_selling_unit_price: input.sellingUnitPrice,
      force_create_new: input.forceCreateNew,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async createWithProduct(input: import("../estimate.repository").CreateEstimateWithProductInput): Promise<{ estimateId: string; repeated: boolean }> {
    const { data, error } = await (await createClient()).rpc("create_estimate_with_catalog_product", {
      target_company_id: input.companyId,
      estimate_name: input.name,
      target_final_customer_id: input.finalCustomerId,
      target_customer_name: input.customerName ?? "",
      target_project_name: input.projectName ?? "",
      target_currency_code: input.currencyCode,
      target_validity_days: input.validityDays,
      estimate_request_key: input.requestKey,
      line_request_key: input.lineRequestKey,
      line_request_fingerprint: input.requestFingerprint,
      line_items: input.lines.map(toLinePayload),
    });
    if (error || typeof data !== "object" || data === null || Array.isArray(data)) throw mapRepositoryError(error?.code);
    return { estimateId: typeof data.estimate_id === "string" ? data.estimate_id : "", repeated: data.repeated === true };
  }

  async createFromPurchasingList(input: Parameters<EstimateRepository["createFromPurchasingList"]>[0]) {
    const { data, error } = await (await createClient()).rpc("create_estimate_from_purchasing_list", {
      target_list_id: input.listId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      target_name: input.name,
      target_currency_code: input.currencyCode,
      target_items: input.items.map((item) => ({
        item_id: item.itemId, product_id: item.productId, quantity: item.quantity, sku: item.sku,
        product_name: item.productName, source_unit_price: item.sourceUnitPrice,
        source_currency_code: item.sourceCurrencyCode, source_snapshot_at: item.sourceSnapshotAt,
        selling_unit_price: item.sellingUnitPrice, converted_cost_unit_price: item.convertedCostUnitPrice,
        exchange_rate: item.exchangeRate, exchange_rate_effective_date: item.exchangeRateEffectiveDate,
      })),
      target_summary: input.summary,
    });
    if (error || typeof data !== "object" || data === null || Array.isArray(data)) throw mapRepositoryError(error?.code);
    return { estimateId: typeof data.estimate_id === "string" ? data.estimate_id : "", repeated: data.repeated === true };
  }

  async updateDraft(input: {
    estimateId: string;
    expectedRevision: number;
    name: string;
    finalCustomerId: string | null;
    customerName: string | null;
    projectName: string | null;
    validityDays: number;
  }): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_estimate_draft_v2", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      estimate_name: input.name,
      target_final_customer_id: input.finalCustomerId,
      target_customer_name: input.customerName ?? "",
      target_project_name: input.projectName ?? "",
      target_validity_days: input.validityDays,
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async saveCommercialDraft(input: SaveEstimateCommercialInput): Promise<Estimate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_estimate_commercial_draft_v2", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      target_final_customer_id: input.settings.finalCustomerId,
      estimate_settings: {
        name: input.settings.name,
        customer_name: input.settings.customerName,
        project_name: input.settings.projectName,
        validity_days: input.settings.validityDays,
        currency_code: input.settings.currencyCode,
        currency_rate: input.settings.currencyRate,
        currency_rate_effective_date: input.settings.currencyRateEffectiveDate,
        vat_mode: input.settings.vatMode,
        vat_rate_percent: input.settings.vatRatePercent,
        global_discount_percent: input.settings.globalDiscountPercent,
      },
      section_payload: input.sections.map((section) => ({ id: section.id, name: section.name, sort_order: section.sortOrder, show_subtotal: section.showSubtotal, discount_percent: section.discountPercent })),
      line_payload: input.lines.map((line) => ({
        id: line.id,
        section_id: line.sectionId,
        position: line.position,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        pricing_mode: line.pricingMode,
        pricing_input_value: line.pricingInputValue,
        internal_cost_unit_price: line.internalCostUnitPrice,
        converted_cost_unit_price: line.convertedCostUnitPrice,
        exchange_rate: line.exchangeRate,
        exchange_rate_effective_date: line.exchangeRateEffectiveDate,
        line_discount_percent: line.lineDiscountPercent,
      })),
      charge_payload: input.charges.map((charge) => ({ id: charge.id, charge_type: charge.chargeType, description: charge.description, amount: charge.amount, vat_applicable: charge.vatApplicable, customer_visible: charge.customerVisible, sort_order: charge.sortOrder })),
    });
    if (error || !data) throw mapRepositoryError(error?.code);
    return mapEstimateRow(data as EstimateRow);
  }

  async addLines(input: import("../estimate.repository").AddEstimateLineBatchInput): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_estimate_items_v2", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      target_section_id: input.targetSectionId,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      line_items: input.lines.map(toLinePayload),
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async addSection(input: import("../estimate.repository").AddEstimateSectionInput): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_estimate_section_v2", {
      target_estimate_id: input.estimateId,
      expected_revision: input.expectedRevision,
      target_request_key: input.requestKey,
      target_request_fingerprint: input.requestFingerprint,
      target_name: input.name,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async updateLine(input: {
    estimateId: string;
    itemId: string;
    expectedRevision: number;
    description: string;
    quantity: number;
    unit: AddEstimateLineInput["unit"];
    sellingUnitPrice: number;
  }): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_estimate_item", {
      target_estimate_id: input.estimateId,
      target_item_id: input.itemId,
      expected_revision: input.expectedRevision,
      target_description: input.description,
      target_quantity: input.quantity,
      target_unit: input.unit,
      target_selling_unit_price: input.sellingUnitPrice,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async removeLine(estimateId: string, itemId: string, expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_estimate_item", {
      target_estimate_id: estimateId,
      target_item_id: itemId,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async removeLines(estimateId: string, itemIds: string[], expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_estimate_items", {
      target_estimate_id: estimateId,
      target_item_ids: itemIds,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async archive(estimateId: string, expectedRevision: number): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("archive_estimate", {
      target_estimate_id: estimateId,
      expected_revision: expectedRevision,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async deleteArchived(estimateId: string, expectedRevision: number, requestKey: string, reason: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_archived_estimate", {
      target_estimate_id: estimateId,
      expected_revision: expectedRevision,
      target_request_key: requestKey,
      target_reason: reason,
    });
    if (error) throw mapRepositoryError(error.code);
  }

  async listServices(companyId: string): Promise<PartnerService[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_services")
      .select("id, company_id, name, default_unit, description, sort_order, default_cost, default_selling_price, vat_applicable, category")
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw mapRepositoryError(error.code);
    return (data as PartnerServiceRow[]).map(mapPartnerServiceRow);
  }
}

function toLinePayload(line: AddEstimateLineInput) {
  return {
    line_type: line.lineType,
    product_id: line.productId,
    service_id: line.serviceId,
    sku_snapshot: line.skuSnapshot,
    product_name_snapshot: line.productNameSnapshot,
    source_unit_price: line.sourceUnitPrice,
    source_currency_code: line.sourceCurrencyCode,
    source_snapshot_at: line.sourceSnapshotAt,
    internal_cost_unit_price: line.internalCostUnitPrice ?? null,
    converted_cost_unit_price: line.convertedCostUnitPrice ?? null,
    exchange_rate: line.exchangeRate ?? null,
    exchange_rate_effective_date: line.exchangeRateEffectiveDate ?? null,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    selling_unit_price: line.sellingUnitPrice,
  };
}

function mapExternalNomenclatureRow(row: Record<string, unknown>): import("../estimate.repository").ExternalNomenclatureRecord {
  return {
    id: String(row.id),
    itemType: row.item_type as import("../estimate.repository").ExternalNomenclatureItemType,
    manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : null,
    model: typeof row.model === "string" ? row.model : null,
    name: String(row.name),
    category: typeof row.category === "string" ? row.category : null,
    unit: row.unit as import("../../types").EstimateUnit,
    specification: typeof row.specification === "string" ? row.specification : null,
    curationStatus: (row.curation_status ?? "review_required") as import("../estimate.repository").ExternalNomenclatureRecord["curationStatus"],
    hasCover: row.has_cover === true,
    coverScope: row.cover_scope === "canonical" || row.cover_scope === "partner" ? row.cover_scope : null,
    exactIdentityMatch: row.exact_identity_match === true,
  };
}

function mapRepositoryError(code: string | undefined): EstimateRepositoryError {
  if (code === "PT409") return new EstimateRepositoryError("conflict", code);
  if (code === "P0002") return new EstimateRepositoryError("not_found", code);
  if (code === "23505") return new EstimateRepositoryError("duplicate", code);
  if (code === "22023" || code === "23514") return new EstimateRepositoryError("invalid", code);
  return new EstimateRepositoryError("persistence", code ?? null);
}

function mapFinalCustomerRow(row: Record<string, unknown>): FinalCustomer {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    displayName: String(row.display_name),
    customerType: row.customer_type as FinalCustomer["customerType"],
    fiscalCode: typeof row.fiscal_code === "string" ? row.fiscal_code : null,
    locality: typeof row.locality === "string" ? row.locality : null,
    industry: typeof row.industry === "string" ? row.industry : null,
    industryCode: typeof row.industry_code === "string" ? row.industry_code as FinalCustomer["industryCode"] : null,
    primaryEmail: typeof row.primary_email === "string" ? row.primary_email : null,
    revision: Number(row.revision),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapFinalCustomerListRow(row: Record<string, unknown>): import("../../types").FinalCustomerListRecord {
  return {
    ...mapFinalCustomerRow(row),
    estimateCount: Number(row.estimate_count ?? 0),
    lastEstimateAt: typeof row.last_estimate_at === "string" ? row.last_estimate_at : null,
    lastEstimateId: typeof row.last_estimate_id === "string" ? row.last_estimate_id : null,
    lastEstimateNumber: typeof row.last_estimate_number === "string" ? row.last_estimate_number : null,
    lastProjectName: typeof row.last_project_name === "string" ? row.last_project_name : null,
    totalCount: Number(row.total_count ?? 0),
  };
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[%,()]/g, " ").replace(/_/g, "\\_");
}
