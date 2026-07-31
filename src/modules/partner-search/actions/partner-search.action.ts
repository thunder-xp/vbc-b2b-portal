"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabasePartnerSearchRepository } from "../repositories/supabase-partner-search.repository";
import { PartnerSearchService } from "../services/partner-search.service";
import type { PartnerSearchGroup } from "../types";

export async function searchPartnerWorkspaceAction(query: string): Promise<ActionResult<PartnerSearchGroup[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    const context = await createPartnerWorkspaceContextService().getWorkspaceContext(userId);
    if (!context.companyId || !["active", "missing_price_type"].includes(context.accessState)) {
      return { success: false, errorCode: "FORBIDDEN", message: "Поиск недоступен.", data: null };
    }
    const groups = await new PartnerSearchService(new SupabasePartnerSearchRepository())
      .search(context.companyId, query);
    return success("Search completed.", groups);
  } catch (error) {
    return failureFromError(error);
  }
}
