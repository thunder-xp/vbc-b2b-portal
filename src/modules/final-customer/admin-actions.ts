"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { createFinalCustomerService } from "./server";
import type { CustomerServiceRequestStatus } from "./types";

export async function updateCustomerServiceRequestStatusAction(formData: FormData) {
  const admin = await requireAdminPermission("admin.service.manage");
  await createFinalCustomerService().updateAdminServiceRequestStatus(
    String(formData.get("requestId") ?? ""),
    Number(formData.get("expectedVersion") ?? -1),
    String(formData.get("status") ?? "") as CustomerServiceRequestStatus,
    admin.userId,
  );
  const requestId = String(formData.get("requestId") ?? "");
  revalidatePath("/admin/service/customers");
  revalidatePath(`/admin/service/customers/${requestId}`);
  revalidatePath("/account/service");
}
