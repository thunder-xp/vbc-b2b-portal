import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { getSafeDatabaseError } from "@/src/lib/observability/safe-database-error";

import { OrderHistoryBootstrapRepositoryError } from "../../orders/repositories";
import type {
  PartnerHistoryBootstrapEnsurer,
  PartnerPriceTypeReadModel,
} from "../services/workspace-context.service";

export class SupabasePartnerPriceTypeReadModel implements PartnerPriceTypeReadModel {
  async findName(externalReference: string): Promise<string | null> {
    const { data, error } = await (await createClient())
      .from("price_types")
      .select("name")
      .eq("external_ref", externalReference)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return typeof data?.name === "string" ? data.name : null;
  }
}

export class SupabasePartnerHistoryBootstrapEnsurer
  implements PartnerHistoryBootstrapEnsurer
{
  async ensureFirstAccess(companyId: string, userId: string): Promise<unknown> {
    const { data, error } = await (await createClient()).rpc(
      "enqueue_partner_order_history_bootstrap",
      {
        p_company_id: companyId,
        p_requested_by_source: "first_access",
        p_requested_by_user_id: userId,
        p_force: false,
      },
    );

    if (error) {
      const safe = getSafeDatabaseError(error);
      throw new OrderHistoryBootstrapRepositoryError(
        "enqueue_partner_order_history_bootstrap",
        safe.code,
        safe.message,
        safe.details,
        safe.hint,
        safe.constraint,
      );
    }
    return data;
  }
}
