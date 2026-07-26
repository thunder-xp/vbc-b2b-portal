import "server-only";

import { notFound, redirect } from "next/navigation";

import { UnauthenticatedError } from "@/src/modules/access-control/services";

import type { AdminWorkspaceContext } from "../types";
import {
  requireAdminPermission,
  requireAnyAdminPermission,
} from "./admin-workspace.service";

export async function requireAdminPagePermission(
  permissionCode: string,
): Promise<AdminWorkspaceContext> {
  try {
    return await requireAdminPermission(permissionCode);
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    notFound();
  }
}

export async function requireAnyAdminPagePermission(
  permissionCodes: readonly string[],
): Promise<AdminWorkspaceContext> {
  try {
    return await requireAnyAdminPermission(permissionCodes);
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    notFound();
  }
}
