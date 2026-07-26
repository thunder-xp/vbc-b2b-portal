export interface AdminRoleManagementRepository {
  assign(userId: string, roleCode: string, reason: string): Promise<void>;
  revoke(userId: string, reason: string): Promise<void>;
}
