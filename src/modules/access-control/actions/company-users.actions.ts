"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MembershipStatus, UserType, type PartnerCompany } from "../types";
import { ForbiddenError, InvalidStateError, NotFoundError } from "../services";
import { failureFromError, success, type ActionResult } from "./action-result";
import {
  createCompanyAccessService,
  createCompanyUserManagementService,
  createUserProfileService,
  getAuthenticatedUser,
} from "./service-factory";

export type CompanyUserMutationState = {
  success: boolean;
  message: string | null;
  invitationUrl: string | null;
};

export async function getCompanyUsersAction(input?: {
  companyId?: string;
  page?: number;
}): Promise<ActionResult<{
  company: Pick<PartnerCompany, "id" | "displayName">;
  users: Awaited<ReturnType<ReturnType<typeof createCompanyUserManagementService>["list"]>>;
  events: Awaited<ReturnType<ReturnType<typeof createCompanyUserManagementService>["listEvents"]>>;
  isAdmin: boolean;
}>> {
  try {
    const scope = await resolveCompanyScope(input?.companyId);
    const service = createCompanyUserManagementService();
    const [users, events] = await Promise.all([
      service.list(scope.userId, scope.company.id, input?.page ?? 1),
      service.listEvents(scope.userId, scope.company.id),
    ]);
    return success("Company users loaded.", {
      company: scope.company,
      users,
      events,
      isAdmin: scope.isAdmin,
    });
  } catch (error) {
    return failureFromError(error);
  }
}

export async function listManageableCompaniesAction(search?: string) {
  try {
    const user = await getAuthenticatedUser();
    const profile = await createUserProfileService().getCurrentProfile(user.id);
    if (profile?.userType !== UserType.Admin) throw new ForbiddenError();
    return success(
      "Companies loaded.",
      await createCompanyUserManagementService().listAdminCompanies(search),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function createEmployeeInvitationAction(
  _state: CompanyUserMutationState,
  formData: FormData,
): Promise<CompanyUserMutationState> {
  try {
    const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
    const result = await createCompanyUserManagementService().createInvitation({
      actorUserId: scope.userId,
      companyId: scope.company.id,
      companyName: scope.company.displayName,
      inviterName: scope.actorName,
      fullName: requiredFormText(formData, "fullName"),
      email: requiredFormText(formData, "email"),
      roleCode: requiredFormText(formData, "roleCode"),
      priceAccess: parsePriceAccess(formData),
      requestKey: randomUUID(),
      applicationUrl: applicationUrl(),
    });
    revalidateCompanyUserPaths(scope.company.id);
    return {
      success: true,
      message: result.delivery === "email_sent"
        ? "Приглашение отправлено."
        : "Приглашение создано. Передайте сотруднику одноразовую ссылку.",
      invitationUrl: result.invitationUrl || null,
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function reissueEmployeeInvitationAction(
  _state: CompanyUserMutationState,
  formData: FormData,
): Promise<CompanyUserMutationState> {
  try {
    const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
    const result = await createCompanyUserManagementService().reissueInvitation({
      actorUserId: scope.userId,
      companyId: scope.company.id,
      companyName: scope.company.displayName,
      inviterName: scope.actorName,
      invitationId: requiredFormText(formData, "invitationId"),
      applicationUrl: applicationUrl(),
    });
    revalidateCompanyUserPaths(scope.company.id);
    return {
      success: true,
      message: result.delivery === "email_sent"
        ? "Новая ссылка отправлена."
        : "Новая одноразовая ссылка создана.",
      invitationUrl: result.invitationUrl,
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function revokeEmployeeInvitationAction(formData: FormData): Promise<void> {
  const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
  await createCompanyUserManagementService().revokeInvitation(
    scope.userId,
    scope.company.id,
    requiredFormText(formData, "invitationId"),
  );
  revalidateCompanyUserPaths(scope.company.id);
}

export async function suspendCompanyEmployeeAction(formData: FormData): Promise<void> {
  const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
  await createCompanyUserManagementService().suspend(
    scope.userId,
    scope.company.id,
    requiredFormText(formData, "membershipId"),
  );
  revalidateCompanyUserPaths(scope.company.id);
}

export async function restoreCompanyEmployeeAction(formData: FormData): Promise<void> {
  const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
  await createCompanyUserManagementService().restore(
    scope.userId,
    scope.company.id,
    requiredFormText(formData, "membershipId"),
  );
  revalidateCompanyUserPaths(scope.company.id);
}

export async function updateCompanyEmployeeAccessAction(formData: FormData): Promise<void> {
  const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
  await createCompanyUserManagementService().updateAccess(
    scope.userId,
    scope.company.id,
    requiredFormText(formData, "membershipId"),
    requiredFormText(formData, "roleCode"),
    parsePriceAccess(formData),
  );
  revalidateCompanyUserPaths(scope.company.id);
}

export async function appointCompanyOwnerAction(formData: FormData): Promise<void> {
  const scope = await resolveCompanyScope(optionalText(formData, "companyId"));
  await createCompanyUserManagementService().appointOwner(
    scope.userId,
    scope.company.id,
    requiredFormText(formData, "membershipId"),
  );
  revalidateCompanyUserPaths(scope.company.id);
}

export async function acceptCompanyInvitationAction(token: string): Promise<never> {
  await getAuthenticatedUser();
  await createCompanyUserManagementService().acceptInvitation(token);
  redirect("/cabinet");
}

async function resolveCompanyScope(requestedCompanyId?: string) {
  const user = await getAuthenticatedUser();
  const profile = await createUserProfileService().getCurrentProfile(user.id);
  if (!profile) throw new NotFoundError();
  const companyAccess = createCompanyAccessService();

  if (profile.userType === UserType.Admin) {
    if (!requestedCompanyId) throw new InvalidStateError();
    const companies = await createCompanyUserManagementService().listAdminCompanies();
    const company = companies.find((item) => item.id === requestedCompanyId);
    if (!company) throw new ForbiddenError();
    return { userId: user.id, actorName: profile.fullName ?? profile.email, company, isAdmin: true };
  }

  const memberships = await companyAccess.getOwnMemberships(user.id);
  const active = memberships.find((membership) => membership.status === MembershipStatus.Active);
  if (!active || (requestedCompanyId && requestedCompanyId !== active.companyId)) {
    throw new ForbiddenError();
  }
  const context = await companyAccess.getActiveCompanyContext(user.id, active.companyId);
  return { userId: user.id, actorName: profile.fullName ?? profile.email, company: context.company, isAdmin: false };
}

function requiredFormText(formData: FormData, key: string): string {
  const value = optionalText(formData, key);
  if (!value) throw new InvalidStateError();
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

function parsePriceAccess(formData: FormData): "full" | "retail_only" {
  const value = requiredFormText(formData, "priceAccess");
  if (value !== "full" && value !== "retail_only") throw new InvalidStateError();
  return value;
}

function applicationUrl(): string {
  return process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nsd.md";
}

function revalidateCompanyUserPaths(companyId: string): void {
  revalidatePath("/cabinet/company/users");
  revalidatePath(`/admin/company-users?companyId=${encodeURIComponent(companyId)}`);
}

function mutationFailure(error: unknown): CompanyUserMutationState {
  const result = failureFromError(error);
  return {
    success: false,
    message: result.errorCode === "SYSTEM_ERROR"
      ? "Не удалось выполнить операцию. Попробуйте ещё раз."
      : "Операция недоступна для текущего состояния.",
    invitationUrl: null,
  };
}
