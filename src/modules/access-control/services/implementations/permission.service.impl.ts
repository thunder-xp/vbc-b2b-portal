import type { RolePermissionRepository } from "../../repositories";
import { cache } from "react";
import { RepositoryUnexpectedError } from "../../repositories";
import type { Permission, Role } from "../../types";
import type {
  PermissionCheckResult,
  PermissionService,
} from "../permission.service";
import {
  AccessControlError,
  PermissionRequiredError,
} from "../errors";
import type { CompanyAccessService } from "../company-access.service";

export class DefaultPermissionService implements PermissionService {
  constructor(
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly companyAccessService?: CompanyAccessService,
  ) {}

  private readonly findRole = cache((roleId: string) =>
    this.rolePermissionRepository.findRoleById(roleId),
  );

  private readonly findRolePermissions = cache((roleId: string) =>
    this.rolePermissionRepository.findPermissionsByRoleId(roleId),
  );

  async getRole(roleId: string): Promise<Role | null> {
    try {
      return await this.findRole(roleId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    try {
      return await this.findRolePermissions(roleId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async hasPermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<boolean> {
    try {
      if (!this.companyAccessService) {
        return await this.rolePermissionRepository.userHasPermission(
          userId,
          companyId,
          permissionCode,
        );
      }
      const context = await this.companyAccessService.getActiveCompanyContext(userId, companyId);
      const permissions = await this.getRolePermissions(context.membership.roleId);
      return permissions.some((permission) => permission.code === permissionCode);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async ensurePermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<PermissionCheckResult> {
    // Permission lookup is not a replacement for CompanyAccessService
    // validation of active user, company, membership, and final access context.
    const isAllowed = await this.hasPermission(
      userId,
      companyId,
      permissionCode,
    );

    if (!isAllowed) {
      throw new PermissionRequiredError();
    }

    return {
      isAllowed,
      permissionCode,
      context: null,
    };
  }

  private mapRepositoryError(error: unknown): AccessControlError {
    if (error instanceof RepositoryUnexpectedError) {
      return new AccessControlError();
    }

    if (error instanceof AccessControlError) {
      return error;
    }

    return new AccessControlError();
  }
}
