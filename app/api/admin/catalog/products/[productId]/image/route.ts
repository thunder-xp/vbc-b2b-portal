import { NextResponse } from "next/server";

import {
  ForbiddenError,
  PermissionRequiredError,
  UnauthenticatedError,
} from "@/src/modules/access-control/services";
import { requireAdminPermission } from "@/src/modules/admin/services";
import { revalidateCatalogSurfaces } from "@/src/modules/catalog-management/actions";
import {
  CatalogImageMutationError,
  CatalogManagementService,
} from "@/src/modules/catalog-management/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    const { productId } = await params;
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({
        success: false,
        errorCode: "CATALOG_IMAGE_REQUIRED",
        correlationId,
      }, { status: 400 });
    }
    const result = await new CatalogManagementService().uploadProductImage({
      productId,
      actorUserId: context.userId,
      correlationId,
      file,
    });
    await revalidateCatalogSurfaces();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const denied = error instanceof PermissionRequiredError
      || error instanceof ForbiddenError
      || error instanceof UnauthenticatedError;
    if (error instanceof CatalogImageMutationError) {
      console.error({
        event: "CATALOG_IMAGE_UPLOAD_FAILED",
        correlationId: error.correlationId,
        stage: error.stage,
        safeErrorCode: error.safeCode,
        cleanupStatus: error.cleanupStatus,
      });
      return NextResponse.json({
        success: false,
        errorCode: error.safeCode,
        stage: error.stage,
        cleanupStatus: error.cleanupStatus,
        correlationId: error.correlationId,
      }, { status: 502 });
    }
    return NextResponse.json({
      success: false,
      errorCode: denied ? "CATALOG_MANAGEMENT_PERMISSION_DENIED" : "CATALOG_IMAGE_UNKNOWN_FAILURE",
      correlationId,
    }, { status: denied ? 403 : 500 });
  }
}
