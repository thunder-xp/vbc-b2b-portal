"use server";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { SupabaseProductRelationAdminRepository, type ProductRelationHealth, type ProductRelationInspectionRow, type ProductRelationQuality } from "../../product-relations/repositories/supabase-product-relation-admin.repository";

export async function getProductRelationDiagnosticsAction(): Promise<ActionResult<{
  health: ProductRelationHealth;
  quality: ProductRelationQuality;
  rows: ProductRelationInspectionRow[];
}>> {
  try {
    await requireAdminPermission("admin.integrations.view");
    const repository = new SupabaseProductRelationAdminRepository();
    const [health, quality, rows] = await Promise.all([
      repository.getHealth(), repository.getQuality(), repository.inspect(),
    ]);
    return success("Диагностика связей товаров загружена.", { health, quality, rows });
  } catch (error) {
    return failureFromError(error);
  }
}
