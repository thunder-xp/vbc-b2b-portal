import "server-only";

import { createClient } from "@/src/lib/supabase/server";

import type { MerchandisingRepository } from "../merchandising.repository";
import { MerchandisingRepositoryError } from "../merchandising.repository";
import type {
  AdminMerchandisingPage,
  AdminMerchandisingPreview,
  ManageMerchandisingResult,
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
  matching_product_count?: number;
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
      throw repositoryError(error);
    }

    return {
      items: data.items,
      totalCount: data.totalCount,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getAdminPreview(
    limitPerLabel: number,
  ): Promise<AdminMerchandisingPreview> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_admin_merchandising_preview",
      { p_limit_per_label: limitPerLabel },
    );

    if (error || !isAdminPreview(data)) {
      throw repositoryError(error);
    }

    return data;
  }

  async listPublished(input: {
    companyId: string;
    labelCode?: MerchandisingLabelCode;
    limitPerLabel: number;
  }): Promise<PublishedMerchandisingAssignment[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_published_product_merchandising_v2",
      {
        p_company_id: input.companyId,
        p_label_code: input.labelCode ?? null,
        p_limit_per_label: input.limitPerLabel,
      },
    );

    if (error || !Array.isArray(data)) {
      throw repositoryError(error);
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
      throw repositoryError(error);
    }

    return (data as PublishedRow[]).map(mapPublishedRow);
  }

  async manage(input: {
    requestId: string;
    operation: "assign" | "revoke" | "hide" | "show";
    productIds: string[];
    labelCode: MerchandisingLabelCode;
    startsAt?: string | null;
    endsAt?: string | null;
    priority: number;
    reason: string;
  }): Promise<ManageMerchandisingResult> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "manage_product_merchandising_v2",
      {
        p_request_id: input.requestId,
        p_operation: input.operation,
        p_product_ids: input.productIds,
        p_label_code: input.labelCode,
        p_starts_at: input.startsAt ?? null,
        p_ends_at: input.endsAt ?? null,
        p_priority: input.priority,
        p_reason: input.reason,
      },
    );

    if (error || !isManageResult(data)) {
      if (error) {
        console.error({
          event: "catalog_merchandising_rpc_failed",
          rpc: "manage_product_merchandising_v2",
          databaseCode: error.code,
          safeCode: safeDatabaseErrorCode(error.message, error.code),
        });
      }
      throw repositoryError(error);
    }

    return data;
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
    matchingProductCount: typeof row.matching_product_count === "number"
      ? row.matching_product_count
      : undefined,
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

function isAdminPreview(value: unknown): value is AdminMerchandisingPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as { sections?: unknown };
  return Array.isArray(preview.sections);
}

function isManageResult(value: unknown): value is ManageMerchandisingResult {
  if (!value || typeof value !== "object") return false;
  const result = value as { affected?: unknown; assignments?: unknown };
  return (
    typeof result.affected === "number" &&
    Array.isArray(result.assignments)
  );
}

function repositoryError(error: {
  code?: string;
  message?: string;
} | null): MerchandisingRepositoryError {
  return new MerchandisingRepositoryError(
    safeDatabaseErrorCode(error?.message, error?.code),
    error?.code ?? null,
  );
}

function safeDatabaseErrorCode(
  message: string | undefined,
  databaseCode: string | undefined,
): string {
  const knownCodes = [
    "MERCHANDISING_PERMISSION_DENIED",
    "MERCHANDISING_PRODUCT_NOT_FOUND",
    "MERCHANDISING_PRODUCT_INACTIVE",
    "MERCHANDISING_INVALID_LABEL",
    "MERCHANDISING_INVALID_PERIOD",
    "MERCHANDISING_DUPLICATE_ASSIGNMENT",
    "MERCHANDISING_AUDIT_FAILURE",
    "MERCHANDISING_DATABASE_CONSTRAINT",
  ];
  const matched = knownCodes.find((code) => message?.includes(code));
  if (matched) return matched;
  if (databaseCode === "23505") return "MERCHANDISING_DUPLICATE_ASSIGNMENT";
  if (databaseCode?.startsWith("23") || databaseCode === "22023") {
    return "MERCHANDISING_DATABASE_CONSTRAINT";
  }
  return "MERCHANDISING_UNKNOWN_FAILURE";
}
