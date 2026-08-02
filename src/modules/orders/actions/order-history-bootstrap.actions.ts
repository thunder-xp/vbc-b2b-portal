"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import type { AdminOrderHistoryBootstrapPage } from "../types";
import { createOrderHistoryBootstrapService } from "./service-factory";

export async function listOrderHistoryBootstrapsAction(): Promise<ActionResult<AdminOrderHistoryBootstrapPage>> {
  try {
    await requireAdminPermission("admin.integrations.view");
    return success("Order-history bootstrap diagnostics loaded.", await createOrderHistoryBootstrapService().listAdmin());
  } catch (error) {
    return failureFromError(error);
  }
}

export async function enqueueOrderHistoryBootstrapAction(formData: FormData): Promise<void> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const companyId = String(formData.get("companyId") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error("Invalid company identifier.");
    const state = await createOrderHistoryBootstrapService().enqueueAdmin(companyId);
    revalidatePath("/admin/integrations/jobs");
    void state;
  } catch (error) {
    console.error({ event: "partner_order_history_bootstrap_admin_enqueue_failed", errorType: error instanceof Error ? error.name : typeof error });
  }
}
