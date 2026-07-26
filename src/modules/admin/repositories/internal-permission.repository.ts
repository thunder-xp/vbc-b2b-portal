import type { InternalPermissionProjection } from "../types";

export interface InternalPermissionRepository {
  findForCurrentUser(userId: string): Promise<InternalPermissionProjection | null>;
}
