import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { requireAdminPermission } from "@/src/modules/admin/services";

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const admin = createAdminClient();
  const { data: attachment, error } = await admin.from("customer_service_attachments")
    .select("request_id,visibility,bucket_name,storage_path,file_name,customer_service_requests!inner(customer_account_id,customer_accounts!inner(auth_user_id))")
    .eq("id", attachmentId).maybeSingle();
  if (error || !attachment) return new NextResponse(null, { status: 404 });
  const request = Array.isArray(attachment.customer_service_requests) ? attachment.customer_service_requests[0] : attachment.customer_service_requests;
  const accountValue = request && (Array.isArray(request.customer_accounts) ? request.customer_accounts[0] : request.customer_accounts);
  const ownsVisibleFile = attachment.visibility === "CUSTOMER_VISIBLE" && accountValue?.auth_user_id === user.id;
  let adminAllowed = false;
  if (!ownsVisibleFile) {
    try { await requireAdminPermission("admin.service.view"); adminAllowed = true; } catch { adminAllowed = false; }
  }
  if (!ownsVisibleFile && !adminAllowed) return new NextResponse(null, { status: 404 });
  const { data: signed, error: signError } = await admin.storage.from(attachment.bucket_name)
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (signError || !signed) return new NextResponse(null, { status: 503 });
  return NextResponse.redirect(signed.signedUrl, 303);
}
