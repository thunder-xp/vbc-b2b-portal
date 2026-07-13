import { createClient } from "@/src/lib/supabase/server";

import {
  ProjectSpecificationRepositoryError,
  type CreateProjectSpecificationInput,
  type InternalSpecificationReviewRecord,
  type ProjectSpecificationItemSnapshotInput,
  type ProjectSpecificationRepository,
  type ReviewProjectSpecificationResult,
  type UpdateProjectSpecificationInput,
} from "../project-specification.repository";
import type {
  ProjectSpecification,
  ProjectSpecificationItem,
} from "../../types";
import {
  mapProjectSpecificationItemRow,
  mapProjectSpecificationRow,
  type ProjectSpecificationItemRow,
  type ProjectSpecificationRow,
} from "./mappers";

const SPECIFICATION_COLUMNS =
  "id, company_id, created_by, project_name, customer_site_name, description, status, submitted_at, parent_specification_id, revision_number, review_comment, reviewed_by, reviewed_at, partner_purchase_total_amount, partner_currency_code_snapshot, retail_total_amount, retail_currency_code_snapshot, gross_profit_usd_snapshot, markup_percentage_snapshot, commercial_snapshot_at, created_at, updated_at";
const ITEM_COLUMNS =
  "id, specification_id, product_id, quantity, product_name_snapshot, sku_snapshot, slug_snapshot, partner_unit_price_amount, partner_currency_code, retail_unit_price_amount, retail_currency_code, available_stock, nearest_arrival_date, nearest_arrival_quantity, gross_profit_usd, markup_percentage, partner_line_total_amount, retail_line_total_amount, snapshot_at, created_at, updated_at";

type InternalReviewRow = ProjectSpecificationRow & {
  partner_companies: { display_name: string };
};

export class SupabaseProjectSpecificationRepository
  implements ProjectSpecificationRepository
{
  async listByCompanyId(companyId: string): Promise<ProjectSpecification[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .select(SPECIFICATION_COLUMNS)
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });

    if (error) throw new ProjectSpecificationRepositoryError();
    return (data as ProjectSpecificationRow[]).map(mapProjectSpecificationRow);
  }

  async listForInternalReview(): Promise<InternalSpecificationReviewRecord[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .select(`${SPECIFICATION_COLUMNS}, partner_companies!inner(display_name)`)
      .neq("status", "draft")
      .order("submitted_at", { ascending: false });

    if (error) throw new ProjectSpecificationRepositoryError();
    return (data as unknown as InternalReviewRow[]).map((row) => ({
      specification: mapProjectSpecificationRow(row),
      companyName: row.partner_companies.display_name,
    }));
  }

  async findById(specificationId: string): Promise<ProjectSpecification | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .select(SPECIFICATION_COLUMNS)
      .eq("id", specificationId)
      .maybeSingle();

    if (error) throw new ProjectSpecificationRepositoryError();
    return data ? mapProjectSpecificationRow(data as ProjectSpecificationRow) : null;
  }

  async findRevisionByParentId(specificationId: string): Promise<ProjectSpecification | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .select(SPECIFICATION_COLUMNS)
      .eq("parent_specification_id", specificationId)
      .maybeSingle();

    if (error) throw new ProjectSpecificationRepositoryError();
    return data ? mapProjectSpecificationRow(data as ProjectSpecificationRow) : null;
  }

  async listItems(specificationId: string): Promise<ProjectSpecificationItem[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specification_items")
      .select(ITEM_COLUMNS)
      .eq("specification_id", specificationId)
      .order("created_at", { ascending: true });

    if (error) throw new ProjectSpecificationRepositoryError();
    return (data as ProjectSpecificationItemRow[]).map(
      mapProjectSpecificationItemRow,
    );
  }

  async create(input: CreateProjectSpecificationInput): Promise<ProjectSpecification> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .insert({
        company_id: input.companyId,
        created_by: input.createdBy,
        project_name: input.projectName,
        customer_site_name: input.customerSiteName,
        description: input.description,
      })
      .select(SPECIFICATION_COLUMNS)
      .single();

    if (error) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationRow(data as ProjectSpecificationRow);
  }

  async updateDraft(input: UpdateProjectSpecificationInput): Promise<ProjectSpecification> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specifications")
      .update({
        project_name: input.projectName,
        customer_site_name: input.customerSiteName,
        description: input.description,
      })
      .eq("id", input.specificationId)
      .select(SPECIFICATION_COLUMNS)
      .single();

    if (error) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationRow(data as ProjectSpecificationRow);
  }

  async addItem(input: {
    specificationId: string;
    productId: string;
    quantity: number;
  }): Promise<ProjectSpecificationItem> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specification_items")
      .insert({
        specification_id: input.specificationId,
        product_id: input.productId,
        quantity: input.quantity,
      })
      .select(ITEM_COLUMNS)
      .single();

    if (error) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationItemRow(data as ProjectSpecificationItemRow);
  }

  async updateItemQuantity(input: {
    itemId: string;
    quantity: number;
  }): Promise<ProjectSpecificationItem> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_specification_items")
      .update({ quantity: input.quantity })
      .eq("id", input.itemId)
      .select(ITEM_COLUMNS)
      .single();

    if (error) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationItemRow(data as ProjectSpecificationItemRow);
  }

  async removeItem(itemId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("project_specification_items")
      .delete()
      .eq("id", itemId);

    if (error) throw new ProjectSpecificationRepositoryError();
  }

  async submit(
    specificationId: string,
    snapshots: ProjectSpecificationItemSnapshotInput[],
  ): Promise<ProjectSpecification> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_project_specification_v2", {
      target_specification_id: specificationId,
      item_snapshots: snapshots.map((snapshot) => ({
        item_id: snapshot.itemId,
        product_name: snapshot.productName,
        sku: snapshot.sku,
        slug: snapshot.slug,
        partner_unit_price_amount: snapshot.partnerUnitPriceAmount,
        partner_currency_code: snapshot.partnerCurrencyCode,
        retail_unit_price_amount: snapshot.retailUnitPriceAmount,
        retail_currency_code: snapshot.retailCurrencyCode,
        available_stock: snapshot.availableStock,
        nearest_arrival_date: snapshot.nearestArrivalDate,
        nearest_arrival_quantity: snapshot.nearestArrivalQuantity,
        gross_profit_usd: snapshot.grossProfitUsd,
        markup_percentage: snapshot.markupPercentage,
      })),
    });

    if (error || !data) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationRow(data as ProjectSpecificationRow);
  }

  async canReviewInternally(): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("can_review_project_specifications");
    if (error) throw new ProjectSpecificationRepositoryError();
    return data === true;
  }

  async review(input: {
    specificationId: string;
    status: ProjectSpecification["status"];
    comment: string | null;
  }): Promise<ReviewProjectSpecificationResult> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("review_project_specification", {
      target_specification_id: input.specificationId,
      target_status: input.status,
      response_comment: input.comment,
    });
    if (error || !data) throw new ProjectSpecificationRepositoryError();
    const result = data as { specification_id: string; status: ProjectSpecification["status"]; revision_id: string | null };
    return { specificationId: result.specification_id, status: result.status, revisionId: result.revision_id };
  }
}
