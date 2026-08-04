import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { storeSupportAttachment, SupportAttachmentError } from "@/src/modules/partner-support/storage";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
    return NextResponse.json({ message: "Некорректная заявка." }, { status: 400 });
  }

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ message: "Требуется вход." }, { status: 401 });

  const { data: canManage, error: accessError } = await client.rpc("can_manage_partner_support_attachment", { p_ticket_id: ticketId });
  if (accessError || !canManage) return NextResponse.json({ message: "Заявка недоступна." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Выберите файл." }, { status: 400 });

  try {
    const attachment = await storeSupportAttachment({ ticketId, userId: user.id, file });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    const message = error instanceof SupportAttachmentError
      ? error.message
      : "Не удалось загрузить файл. Заявка сохранена.";
    return NextResponse.json({ message }, { status: error instanceof SupportAttachmentError ? error.status : 503 });
  }
}
