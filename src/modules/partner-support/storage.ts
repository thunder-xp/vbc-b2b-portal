import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { hasValidSupportFileSignature, SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MIME } from "./attachment-policy";

export class SupportAttachmentError extends Error { constructor(message: string, readonly status = 503) { super(message); this.name = "SupportAttachmentError"; } }
export async function storeSupportAttachment(input: { ticketId: string; userId: string; file: File }) {
  const { file } = input;
  if (file.size < 1 || file.size > SUPPORT_ATTACHMENT_MAX_BYTES || !SUPPORT_ATTACHMENT_MIME.includes(file.type as never)) throw new SupportAttachmentError("Допустимы JPG, PNG, WEBP или PDF до 15 МБ.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSupportFileSignature(bytes, file.type)) throw new SupportAttachmentError("Содержимое файла не соответствует формату.", 400);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "evidence";
  const storageKey = `${input.ticketId}/${randomUUID()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from("partner-support-evidence").upload(storageKey, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw new SupportAttachmentError("Не удалось загрузить файл.");
  const { data: attachment, error: insertError } = await admin.from("partner_support_ticket_attachments").insert({ ticket_id: input.ticketId, uploaded_by_user_id: input.userId, file_name: file.name.slice(0, 240), mime_type: file.type, file_size: file.size, checksum_sha256: createHash("sha256").update(bytes).digest("hex"), storage_key: storageKey }).select("id").single();
  if (insertError) { await admin.storage.from("partner-support-evidence").remove([storageKey]); throw new SupportAttachmentError("Не удалось сохранить файл."); }
  await admin.from("partner_support_ticket_events").insert({ ticket_id: input.ticketId, actor_user_id: input.userId, event_type: "attachment_uploaded", partner_visible: true, message: "Добавлен файл.", safe_metadata: { attachmentId: attachment.id } });
  return { id: attachment.id, fileName: file.name };
}
