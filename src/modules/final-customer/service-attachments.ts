import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  hasValidServiceFileSignature,
  SERVICE_ATTACHMENT_MAX_BYTES,
  SERVICE_ATTACHMENT_MAX_COUNT,
  SERVICE_ATTACHMENT_MIME,
} from "@/src/modules/service-attachments/policy";
import type { FinalCustomerRepository } from "./repository";

export class CustomerServiceAttachmentError extends Error {
  constructor(readonly safeCode: string) { super(safeCode); this.name = "CustomerServiceAttachmentError"; }
}

export async function storeCustomerServiceAttachments(input: {
  repository: FinalCustomerRepository;
  requestId: string;
  messageId: string | null;
  actorKind: "CUSTOMER" | "ADMIN";
  actorUserId: string;
  customerIdentityId: string | null;
  visibility: "CUSTOMER_VISIBLE" | "INTERNAL";
  files: File[];
}) {
  const files = input.files.filter((file) => file.size > 0);
  if (files.length > SERVICE_ATTACHMENT_MAX_COUNT) throw new CustomerServiceAttachmentError("ATTACHMENT_COUNT_EXCEEDED");
  const admin = createAdminClient();
  const saved: string[] = [];
  for (const file of files) {
    if (file.size > SERVICE_ATTACHMENT_MAX_BYTES || !SERVICE_ATTACHMENT_MIME.includes(file.type as never)) throw new CustomerServiceAttachmentError("ATTACHMENT_TYPE_OR_SIZE_INVALID");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidServiceFileSignature(bytes, file.type)) throw new CustomerServiceAttachmentError("ATTACHMENT_SIGNATURE_INVALID");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "evidence";
    const storagePath = `customer-service/${input.requestId}/${randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("service-evidence").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new CustomerServiceAttachmentError("ATTACHMENT_UPLOAD_FAILED");
    try {
      saved.push(await input.repository.addServiceAttachment({
        requestId: input.requestId, messageId: input.messageId, actorKind: input.actorKind,
        actorUserId: input.actorUserId, customerIdentityId: input.customerIdentityId,
        visibility: input.visibility, storagePath, fileName: file.name.slice(0, 180),
        contentType: file.type, sizeBytes: file.size,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      }));
    } catch (error) {
      await admin.storage.from("service-evidence").remove([storagePath]);
      throw error;
    }
  }
  return saved;
}

export function filesFromFormData(formData: FormData, name: string): File[] {
  return formData.getAll(name).filter((value): value is File => value instanceof File && value.size > 0);
}
