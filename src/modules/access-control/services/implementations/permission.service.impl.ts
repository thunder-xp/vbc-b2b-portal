import type {
  EffectivePermissionRepository,
  RolePermissionRepository,
} from "../../repositories";
import { cache } from "react";
import { RepositoryUnexpectedError } from "../../repositories";
import type { EffectivePermissionContext, Permission, Role } from "../../types";
import type {
  PermissionCheckResult,
  PermissionService,
} from "../permission.service";
import {
  AccessControlError,
  ForbiddenError,
  PermissionRequiredError,
} from "../errors";

export class DefaultPermissionService implements PermissionService {
  constructor(
    private readonly rolePermissionRepository: RolePermissionRepository,
    private readonly effectivePermissionRepository: EffectivePermissionRepository,
  ) {}

  private readonly findRole = cache((roleId: string) =>
    this.rolePermissionRepository.findRoleById(roleId),
  );

  private readonly findRolePermissions = cache((roleId: string) =>
    this.rolePermissionRepository.findPermissionsByRoleId(roleId),
  );

  private readonly findEffectivePermissionContext = cache(
    (userId: string, companyId: string) =>
      this.effectivePermissionRepository.findForCurrentUser(userId, companyId),
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

  async getEffectivePermissionContext(
    userId: string,
    companyId: string,
  ): Promise<EffectivePermissionContext> {
    try {
      const context = await this.findEffectivePermissionContext(userId, companyId);
      if (!context) {
        throw new ForbiddenError("Company access is not allowed.");
      }
      return context;
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
      const context = await this.getEffectivePermissionContext(userId, companyId);
      return context.effectivePermissionCodes.includes(permissionCode);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async ensurePermission(
    userId: string,
    companyId: string,
    permissionCode: string,
  ): Promise<PermissionCheckResult> {
    const context = await this.getEffectivePermissionContext(userId, companyId);
    const isAllowed = context.effectivePermissionCodes.includes(permissionCode);

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
