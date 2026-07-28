import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type { MerchandisingRepository } from "../merchandising.repository";
import { MerchandisingRepositoryError } from "../merchandising.repository";
import type {
  AdminMerchandisingPage,
  MerchandisingLabelCode,
  PublishedMerchandisingAssignment,
} from "../../types";

type PublishedRow = {
  product_id: string;
  label_code: MerchandisingLabelCode;
  priority: number;
  starts_at: string;
  ends_at: string | null;
  source: "manual" | "one_c";
};

export class SupabaseMerchandisingRepository
  implements MerchandisingRepository
{
  async listAdminProducts(input: {
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<AdminMerchandisingPage> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_admin_merchandising_page",
      {
        p_search: input.search ?? null,
        p_limit: input.pageSize,
        p_offset: (input.page - 1) * input.pageSize,
      },
    );

    if (error || !isAdminPage(data)) {
      throw new MerchandisingRepositoryError(error?.code);
    }

    return {
      items: data.items,
      totalCount: data.totalCount,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async listPublished(input: {
    companyId: string;
    labelCode?: MerchandisingLabelCode;
    limitPerLabel: number;
  }): Promise<PublishedMerchandisingAssignment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_published_product_merchandising",
      {
        p_company_id: input.companyId,
        p_label_code: input.labelCode ?? null,
        p_limit_per_label: input.limitPerLabel,
      },
    );

    if (error || !Array.isArray(data)) {
      throw new MerchandisingRepositoryError(error?.code);
    }

    return (data as PublishedRow[]).map(mapPublishedRow);
  }

  async listPublishedForProducts(input: {
    companyId: string;
    productIds: string[];
  }): Promise<PublishedMerchandisingAssignment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_published_product_labels",
      {
        p_company_id: input.companyId,
        p_product_ids: input.productIds,
      },
    );

    if (error || !Array.isArray(data)) {
      throw new MerchandisingRepositoryError(error?.code);
    }

    return (data as PublishedRow[]).map(mapPublishedRow);
  }

  async manage(input: {
    operation: "assign" | "revoke" | "hide" | "show";
    productIds: string[];
    labelCode: MerchandisingLabelCode;
    startsAt?: string | null;
    endsAt?: string | null;
    priority: number;
    reason: string;
  }): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "manage_product_merchandising",
      {
        p_operation: input.operation,
        p_product_ids: input.productIds,
        p_label_code: input.labelCode,
        p_starts_at: input.startsAt ?? null,
        p_ends_at: input.endsAt ?? null,
        p_priority: input.priority,
        p_reason: input.reason,
      },
    );

    if (
      error ||
      !data ||
      typeof data !== "object" ||
      typeof (data as { affected?: unknown }).affected !== "number"
    ) {
      throw new MerchandisingRepositoryError(error?.code);
    }

    return (data as { affected: number }).affected;
  }
}

function mapPublishedRow(row: PublishedRow): PublishedMerchandisingAssignment {
  return {
    productId: row.product_id,
    labelCode: row.label_code,
    priority: row.priority,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    source: row.source,
  };
}

function isAdminPage(value: unknown): value is {
  items: AdminMerchandisingPage["items"];
  totalCount: number;
} {
  if (!value || typeof value !== "object") return false;
  const page = value as { items?: unknown; totalCount?: unknown };
  return Array.isArray(page.items) && typeof page.totalCount === "number";
}
