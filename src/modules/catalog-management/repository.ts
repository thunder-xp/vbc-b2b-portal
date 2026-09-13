import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type {
  AdminCatalogProduct,
  CatalogManagementFilter,
  CatalogManagementPage,
  CatalogVisibilityResult,
} from "./types";

export type CatalogImageMutationStatus =
  | "started"
  | "firebase_stored"
  | "one_c_confirmed"
  | "refresh_pending"
  | "succeeded"
  | "failed"
  | "recovered";

export type CatalogImageAuditEvent =
  | "CATALOG_IMAGE_UPLOAD_STARTED"
  | "CATALOG_IMAGE_FIREBASE_STORED"
  | "CATALOG_IMAGE_1C_WRITE_CONFIRMED"
  | "CATALOG_IMAGE_REPLACED"
  | "CATALOG_IMAGE_UPLOAD_FAILED";

export class CatalogManagementRepositoryError extends Error {
  constructor(readonly safeCode: string, readonly databaseCode: string | null = null) {
    super(safeCode);
    this.name = "CatalogManagementRepositoryError";
  }
}

export class CatalogManagementRepository {
  async list(input: {
    filter: CatalogManagementFilter;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<CatalogManagementPage> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_admin_catalog_management_page_v1", {
      p_filter: input.filter,
      p_search: input.search?.trim() || null,
      p_limit: input.pageSize,
      p_offset: (input.page - 1) * input.pageSize,
    });
    if (error || !isCatalogManagementPayload(data)) {
      throw new CatalogManagementRepositoryError("CATALOG_MANAGEMENT_READ_FAILED", error?.code ?? null);
    }
    return { ...data, page: input.page, pageSize: input.pageSize };
  }

  async setVisibility(input: {
    productId: string;
    visible: boolean;
    reason: string;
    correlationId: string;
  }): Promise<CatalogVisibilityResult> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("manage_catalog_product_visibility_v1", {
      p_product_id: input.productId,
      p_visible: input.visible,
      p_reason: input.reason,
      p_correlation_id: input.correlationId,
    });
    if (error || !isVisibilityResult(data)) {
      throw new CatalogManagementRepositoryError("CATALOG_VISIBILITY_WRITE_FAILED", error?.code ?? null);
    }
    return data;
  }

  async getProductForImageMutation(productId: string): Promise<Pick<AdminCatalogProduct,
    "id" | "external1cId" | "sku" | "name" | "imageOriginalUrl" | "isActiveIn1C"
  > | null> {
    const { data, error } = await createAdminClient()
      .from("catalog_products")
      .select("id,external_1c_id,sku,name,image_original_url,is_active")
      .eq("id", productId)
      .maybeSingle();
    if (error) throw new CatalogManagementRepositoryError("CATALOG_PRODUCT_LOOKUP_FAILED", error.code);
    if (!data) return null;
    return {
      id: data.id,
      external1cId: data.external_1c_id,
      sku: data.sku,
      name: data.name,
      imageOriginalUrl: data.image_original_url,
      isActiveIn1C: data.is_active,
    };
  }

  async startImageMutation(input: {
    correlationId: string;
    product: { id: string; external1cId: string; imageOriginalUrl: string | null };
    actorUserId: string;
  }): Promise<void> {
    const admin = createAdminClient();
    const mutation = await admin.from("catalog_product_image_mutations").insert({
      correlation_id: input.correlationId,
      product_id: input.product.id,
      product_external_1c_id: input.product.external1cId,
      actor_user_id: input.actorUserId,
      status: "started",
      stage: "validation",
      old_url: input.product.imageOriginalUrl,
      cleanup_status: "NOT_REQUIRED",
    });
    if (mutation.error) throw new CatalogManagementRepositoryError("CATALOG_IMAGE_AUDIT_FAILED", mutation.error.code);
    await this.appendImageAudit({
      ...input,
      eventType: "CATALOG_IMAGE_UPLOAD_STARTED",
      stage: "validation",
      oldUrl: input.product.imageOriginalUrl,
    });
  }

  async updateImageMutation(input: {
    correlationId: string;
    status: CatalogImageMutationStatus;
    stage: string;
    newUrl?: string | null;
    objectPath?: string | null;
    safeErrorCode?: string | null;
    cleanupStatus?: string;
    completed?: boolean;
  }): Promise<void> {
    const { error } = await createAdminClient()
      .from("catalog_product_image_mutations")
      .update({
        status: input.status,
        stage: input.stage,
        ...(input.newUrl !== undefined ? { new_url: input.newUrl } : {}),
        ...(input.objectPath !== undefined ? { firebase_object_path: input.objectPath } : {}),
        ...(input.safeErrorCode !== undefined ? { safe_error_code: input.safeErrorCode } : {}),
        ...(input.cleanupStatus !== undefined ? { cleanup_status: input.cleanupStatus } : {}),
        updated_at: new Date().toISOString(),
        ...(input.completed ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("correlation_id", input.correlationId);
    if (error) throw new CatalogManagementRepositoryError("CATALOG_IMAGE_AUDIT_FAILED", error.code);
  }

  async appendImageAudit(input: {
    correlationId: string;
    product: { id: string; external1cId: string };
    actorUserId: string;
    eventType: CatalogImageAuditEvent;
    stage: string;
    oldUrl?: string | null;
    newUrl?: string | null;
    safeErrorCode?: string | null;
    cleanupStatus?: string | null;
    safeMetadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await createAdminClient().from("catalog_product_management_audit_events").insert({
      product_id: input.product.id,
      product_external_1c_id: input.product.external1cId,
      actor_user_id: input.actorUserId,
      event_type: input.eventType,
      correlation_id: input.correlationId,
      stage: input.stage,
      old_url: input.oldUrl ?? null,
      new_url: input.newUrl ?? null,
      safe_error_code: input.safeErrorCode ?? null,
      cleanup_status: input.cleanupStatus ?? null,
      safe_metadata: input.safeMetadata ?? {},
    });
    if (error) throw new CatalogManagementRepositoryError("CATALOG_IMAGE_AUDIT_FAILED", error.code);
  }

  async publishTargetedImage(productId: string, imageUrl: string): Promise<void> {
    const { error } = await createAdminClient()
      .from("catalog_products")
      .update({ image_original_url: imageUrl })
      .eq("id", productId);
    if (error) throw new CatalogManagementRepositoryError("CATALOG_TARGETED_REFRESH_FAILED", error.code);
  }

  async verifyTargetedImage(productId: string, imageUrl: string): Promise<boolean> {
    const { data, error } = await createAdminClient()
      .from("catalog_products")
      .select("image_original_url,image_source_url")
      .eq("id", productId)
      .single();
    if (error) throw new CatalogManagementRepositoryError("CATALOG_TARGETED_REFRESH_FAILED", error.code);
    return data.image_original_url === imageUrl && data.image_source_url === imageUrl;
  }

  async countCanonicalImageReferences(imageUrl: string, excludedProductId: string): Promise<number> {
    const { count, error } = await createAdminClient()
      .from("catalog_products")
      .select("id", { count: "exact", head: true })
      .eq("image_original_url", imageUrl)
      .neq("id", excludedProductId);
    if (error) throw new CatalogManagementRepositoryError("CATALOG_IMAGE_REFERENCE_CHECK_FAILED", error.code);
    return count ?? 0;
  }

  async recoverPriorFailures(productId: string, currentCorrelationId: string): Promise<void> {
    const { error } = await createAdminClient()
      .from("catalog_product_image_mutations")
      .update({ status: "recovered", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("product_id", productId)
      .neq("correlation_id", currentCorrelationId)
      .in("status", ["failed", "refresh_pending"]);
    if (error) throw new CatalogManagementRepositoryError("CATALOG_IMAGE_RECOVERY_MARK_FAILED", error.code);
  }
}

function isCatalogManagementPayload(value: unknown): value is Omit<CatalogManagementPage, "page" | "pageSize"> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return !!row.counters && typeof row.counters === "object" && typeof row.totalCount === "number"
    && Array.isArray(row.items) && Array.isArray(row.recentImageFailures);
}

function isVisibilityResult(value: unknown): value is CatalogVisibilityResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.productId === "string" && typeof row.visible === "boolean"
    && typeof row.isActiveIn1C === "boolean" && typeof row.changed === "boolean";
}
