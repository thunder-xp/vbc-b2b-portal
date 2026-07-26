import "server-only";

import { cache } from "react";

import { getAuthenticatedUser } from "@/src/modules/access-control/actions/service-factory";
import {
  ForbiddenError,
  PermissionRequiredError,
} from "@/src/modules/access-control/services";

import { buildAdminNavigation } from "../navigation";
import { SupabaseInternalPermissionRepository } from "../repositories";
import type {
  AdminEnvironment,
  AdminWorkspaceContext,
  InternalPermissionProjection,
} from "../types";

function resolveEnvironment(): AdminEnvironment {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

export function toAdminWorkspaceContext(
  projection: InternalPermissionProjection,
): AdminWorkspaceContext {
  return {
    userId: projection.userId,
    displayName: projection.displayName,
    roleCodes: projection.internalRoleCodes,
    permissions: projection.effectivePermissionCodes,
    isPlatformAdmin: projection.isPlatformAdmin,
    navigation: buildAdminNavigation(projection.effectivePermissionCodes),
    environment: resolveEnvironment(),
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}

const repository = new SupabaseInternalPermissionRepository();

export const getAdminWorkspaceContext = cache(
  async (): Promise<AdminWorkspaceContext> => {
    const user = await getAuthenticatedUser();
    const projection = await repository.findForCurrentUser(user.id);

    if (!projection) throw new ForbiddenError("Internal access is not allowed.");

    return toAdminWorkspaceContext(projection);
  },
);

export async function requireAdminPermission(
  permissionCode: string,
): Promise<AdminWorkspaceContext> {
  const context = await getAdminWorkspaceContext();
  if (!context.permissions.includes(permissionCode)) {
    throw new PermissionRequiredError();
  }
  return context;
}

export async function requireAnyAdminPermission(
  permissionCodes: readonly string[],
): Promise<AdminWorkspaceContext> {
  const context = await getAdminWorkspaceContext();
  if (!permissionCodes.some((code) => context.permissions.includes(code))) {
    throw new PermissionRequiredError();
  }
  return context;
}
