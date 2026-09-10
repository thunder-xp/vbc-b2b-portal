import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createDailyCatalogSyncService } from "@/src/modules/integration/services";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authorization = await authorizeCronRequest(request);
  if (!authorization.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createDailyCatalogSyncService(getOneCEnv()).runFullSync("scheduled", {
    requestId: authorization.requestId,
  });
  return NextResponse.json({ status: result.state.status, rootFound: Boolean(result.state.rootName), pagesProcessed: result.state.pagesProcessed, foldersReceived: result.state.foldersReceived, productsReceived: result.state.productsReceived, rowsDeactivated: result.state.rowsDeactivated, skippedBecauseRunning: result.skippedBecauseRunning, publicRetail: result.projection?.status ?? "not_started", publicationId: result.projection?.publicationId ?? null, automatedNew: result.newProduct });
}
