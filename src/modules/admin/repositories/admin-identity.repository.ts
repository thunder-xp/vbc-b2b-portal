import type {
  AdminInvitationFilter,
  AdminInvitationPage,
  AdminUserFilter,
  AdminUserPage,
} from "../types";

export type ListAdminUsersRepositoryInput = {
  page: number;
  pageSize: number;
  search: string;
  filter: AdminUserFilter;
};

export type ListAdminInvitationsRepositoryInput = {
  page: number;
  pageSize: number;
  search: string;
  filter: AdminInvitationFilter;
};

export interface AdminIdentityRepository {
  listUsers(input: ListAdminUsersRepositoryInput): Promise<AdminUserPage>;
  listInvitations(
    input: ListAdminInvitationsRepositoryInput,
  ): Promise<AdminInvitationPage>;
}
