import type { EffectivePermissionContext } from "../types";

export interface EffectivePermissionRepository {
  findForCurrentUser(
    userId: string,
    companyId: string,
  ): Promise<EffectivePermissionContext | null>;
}
