import { NextResponse } from "next/server";

import { createProposalDeliveryService } from "@/src/modules/estimates/actions/service-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await createProposalDeliveryService().download(token);
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proposal is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
