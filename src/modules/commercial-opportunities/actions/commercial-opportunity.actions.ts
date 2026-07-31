"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { createCommercialOpportunityService, getAuthenticatedUserId } from "./service-factory";
import { requireAdminPermission } from "../../admin/services";
import { createClient } from "@/src/lib/supabase/server";

const filterSchema = z.enum(["all", "available", "arrivals", "price", "templates", "offers"]);

export async function listCommercialOpportunitiesAction(input: { filter?: string; page?: number; pageSize?: number } = {}) {
  const filter = filterSchema.safeParse(input.filter ?? "all");
  if (!filter.success) return invalidInput("Укажите корректный раздел возможностей.");
  try {
    return success("Возможности для закупки загружены.", await createCommercialOpportunityService().list(
      await getAuthenticatedUserId(),
      { filter: filter.data, page: input.page, pageSize: input.pageSize },
    ));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function dismissCommercialOpportunityAction(opportunityId: string) {
  const parsed = z.string().uuid().safeParse(opportunityId);
  if (!parsed.success) return invalidInput("Возможность не найдена.");
  try {
    await createCommercialOpportunityService().dismiss(await getAuthenticatedUserId(), parsed.data);
    revalidatePath("/cabinet/opportunities");
    revalidatePath("/cabinet");
    return success("Возможность скрыта до следующего изменения условий.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getCommercialOpportunityDiagnosticsAction() {
  await requireAdminPermission("admin.opportunities.view");
  const { data, error } = await (await createClient()).rpc("get_partner_commercial_opportunity_diagnostics");
  if (error || typeof data !== "object" || data === null) throw new Error("Opportunity diagnostics are unavailable.");
  return data as Record<string, unknown>;
}
