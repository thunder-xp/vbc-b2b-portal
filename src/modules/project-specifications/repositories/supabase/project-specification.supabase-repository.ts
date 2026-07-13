import { createClient } from "@/src/lib/supabase/server";

import {
  ProjectSpecificationRepositoryError,
  type CreateProjectSpecificationInput,
  type ProjectSpecificationRepository,
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
  "id, company_id, created_by, project_name, customer_site_name, description, status, submitted_at, created_at, updated_at";
const ITEM_COLUMNS =
  "id, specification_id, product_id, quantity, created_at, updated_at";

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

  async submit(specificationId: string): Promise<ProjectSpecification> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_project_specification", {
      target_specification_id: specificationId,
    });

    if (error || !data) throw new ProjectSpecificationRepositoryError();
    return mapProjectSpecificationRow(data as ProjectSpecificationRow);
  }
}
