export type { InternalPermissionRepository } from "./internal-permission.repository";
export type {
  AdminCompanyRepository,
  ListAdminCompaniesRepositoryInput,
} from "./admin-company.repository";
export type {
  AdminIdentityRepository,
  ListAdminInvitationsRepositoryInput,
  ListAdminUsersRepositoryInput,
} from "./admin-identity.repository";
export type { AdminAccessRepository } from "./admin-access.repository";
export type { AdminRoleManagementRepository } from "./admin-role-management.repository";
export type {
  AdminHistoryRepository,
  ListAdminHistoryInput,
} from "./admin-history.repository";
export type {
  AdminDashboardRepository,
  AdminOperationalProjection,
  AdminPlatformHealthProjection,
  AdminRecentEventProjection,
} from "./admin-dashboard.repository";
export * from "./supabase";
