import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type {
  CatalogPlanOperation,
  CatalogQueryPlanRepository,
} from "./catalog-query-plan.repository";

export class SupabaseCatalogQueryPlanRepository implements CatalogQueryPlanRepository {
  async explain(operation: CatalogPlanOperation, companyId: string): Promise<unknown> {
    const { data, error } = await createAdminClient().rpc("explain_catalog_operation", {
      p_operation: operation,
      p_company_id: companyId,
    });
    if (error) throw new Error("Catalog query plan diagnostic failed.");
    return data;
  }
}
