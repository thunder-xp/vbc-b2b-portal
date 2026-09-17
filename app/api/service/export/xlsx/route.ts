import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/src/modules/access-control/actions/service-factory";
import { UnauthenticatedError } from "@/src/modules/access-control/services";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { renderServiceStatementXlsx, serviceStatementFilename } from "@/src/modules/service-history/exports";
import { createServiceHistoryService } from "@/src/modules/service-history/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    const [userId, locale] = await Promise.all([getAuthenticatedUserId(), getPartnerLocale()]);
    const statement = await createServiceHistoryService().getPartnerMonthExport(userId, { month });
    const bytes = renderServiceStatementXlsx(statement, locale);
    return new NextResponse(Buffer.from(bytes), { headers: downloadHeaders(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      serviceStatementFilename(statement.month, "xlsx"),
      bytes.byteLength,
    ) });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }
    console.error({ event: "partner_service_xlsx_export_failed", errorType: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ message: "Export is temporarily unavailable." }, { status: 503 });
  }
}

function downloadHeaders(contentType: string, filename: string, length: number) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(length),
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  };
}
