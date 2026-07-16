import { NextResponse } from "next/server";

import { createProposalService, getAuthenticatedUserId } from "@/src/modules/estimates/actions/service-factory";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const userId = await getAuthenticatedUserId();
    const { documentId } = await params;
    const document = await createProposalService().downloadPdf(userId, documentId);
    return new NextResponse(Buffer.from(document.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${document.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ message: "Документ недоступен." }, { status: 404 });
  }
}
