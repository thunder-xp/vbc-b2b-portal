"use server";

import { revalidatePath } from "next/cache";

import { InvalidStateError } from "@/src/modules/access-control/services";

import {
  createAdminRoleManagementService,
  requireAdminPermission,
} from "../services";

export async function assignInternalRoleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("admin.permissions.manage");
  await createAdminRoleManagementService().assign(
    requiredText(formData, "userId"),
    requiredText(formData, "roleCode"),
    requiredText(formData, "reason"),
  );
  revalidateAdminIdentityPaths();
}

export async function revokeInternalRoleAction(formData: FormData): Promise<void> {
  await requireAdminPermission("admin.permissions.manage");
  await createAdminRoleManagementService().revoke(
    requiredText(formData, "userId"),
    requiredText(formData, "reason"),
  );
  revalidateAdminIdentityPaths();
}

export async function grantOnboardingCapabilityAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.permissions.manage");
  if (!context.isPlatformAdmin) throw new InvalidStateError();
  await createAdminRoleManagementService().grantOnboardingCapability(
    requiredText(formData, "userId"),
    requiredText(formData, "reason"),
  );
  revalidateAdminIdentityPaths();
  revalidatePath("/admin/onboarding");
}

export async function revokeOnboardingCapabilityAction(formData: FormData): Promise<void> {
  const context = await requireAdminPermission("admin.permissions.manage");
  if (!context.isPlatformAdmin) throw new InvalidStateError();
  await createAdminRoleManagementService().revokeOnboardingCapability(
    requiredText(formData, "userId"),
    requiredText(formData, "reason"),
  );
  revalidateAdminIdentityPaths();
  revalidatePath("/admin/onboarding");
}

function requiredText(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new InvalidStateError();
  return value;
}

function revalidateAdminIdentityPaths(): void {
  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
}
