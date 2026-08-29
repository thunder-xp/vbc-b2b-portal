"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import type { OrderHistoryFullAuditAdminItem } from "../types";
import { createOrderHistoryIntegrityService } from "./service-factory";

export async function listOrderHistoryIntegrityAuditsAction(): Promise<ActionResult<OrderHistoryFullAuditAdminItem[]>> {
  try {
    await requireAdminPermission("admin.integrations.view");
    return success("Order-history integrity audits loaded.", await createOrderHistoryIntegrityService().listAdmin());
  } catch (error) {
    return failureFromError(error);
  }
}

export async function enqueueOrderHistoryIntegrityAuditAction(formData: FormData): Promise<void> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const companyId = String(formData.get("companyId") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error("Invalid company identifier.");
    await createOrderHistoryIntegrityService().enqueue(companyId);
    revalidatePath("/admin/integrations/jobs");
  } catch (error) {
    console.error({ event: "partner_order_history_integrity_admin_enqueue_failed", errorType: error instanceof Error ? error.name : typeof error });
  }
}
