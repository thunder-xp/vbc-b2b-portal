"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { createFinalCustomerService } from "./server";
import { filesFromFormData, storeCustomerServiceAttachments } from "./service-attachments";
import { SupabaseFinalCustomerRepository } from "./supabase.repository";
import type { CustomerServiceRequestStatus } from "./types";

export async function updateCustomerServiceRequestStatusAction(formData: FormData) {
  const admin = await requireAdminPermission("admin.service.manage");
  const requestId = String(formData.get("requestId") ?? "");
  const customerReply = String(formData.get("customerReply") ?? "");
  const internalNote = String(formData.get("internalNote") ?? "");
  const result = await createFinalCustomerService().updateAdminServiceRequest({
    requestId, expectedVersion: Number(formData.get("expectedVersion") ?? -1),
    status: (String(formData.get("status") ?? "") || null) as CustomerServiceRequestStatus | null,
    customerReply, internalNote, actorUserId: admin.userId,
  });
  const repository = new SupabaseFinalCustomerRepository();
  await storeCustomerServiceAttachments({ repository, requestId, messageId: result.messageId,
    actorKind: "ADMIN", actorUserId: admin.userId, customerIdentityId: null,
    visibility: "CUSTOMER_VISIBLE", files: filesFromFormData(formData, "customerFiles") });
  await storeCustomerServiceAttachments({ repository, requestId, messageId: null,
    actorKind: "ADMIN", actorUserId: admin.userId, customerIdentityId: null,
    visibility: "INTERNAL", files: filesFromFormData(formData, "internalFiles") });
  revalidatePath("/admin/service/customers");
  revalidatePath(`/admin/service/customers/${requestId}`);
  revalidatePath("/account/service");
}
