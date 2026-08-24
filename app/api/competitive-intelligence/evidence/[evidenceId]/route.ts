import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { CompetitiveIntelligenceRepository } from "@/src/modules/competitive-intelligence";

export async function GET(_request: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const { evidenceId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(evidenceId)) return unavailable();
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const workspace = await getPartnerWorkspaceContextAction();
  try {
    const repository = new CompetitiveIntelligenceRepository();
    const descriptor = await repository.getEvidenceDescriptor(workspace.success ? workspace.data.companyId : null, evidenceId);
    const bytes = await repository.downloadEvidence(descriptor);
    return new NextResponse(bytes.buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(descriptor.fileName)}`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": descriptor.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return NextResponse.json({ message: "Файл недоступен." }, { status: 404 });
}
