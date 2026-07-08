import type {
  AccessRequest,
  AccessRequestStatus,
  CompanyStatus,
  CompanyMembership,
  Invitation,
  InvitationStatus,
  MembershipStatus,
  PartnerCompany,
  Permission,
  Role,
  RolePermission,
  RoleScope,
  UserProfile,
  UserStatus,
  UserType,
} from "../../types";

export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  status: UserStatus;
  user_type: UserType;
  created_at: string;
  updated_at: string;
}

export interface PartnerCompanyRow {
  id: string;
  external_1c_id: string;
  display_name: string;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface CompanyMembershipRow {
  id: string;
  user_id: string;
  company_id: string;
  role_id: string;
  status: MembershipStatus;
  approved_by: string | null;
  approved_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  scope: RoleScope;
  created_at: string;
}

export interface PermissionRow {
  id: string;
  code: string;
  description: string | null;
  created_at: string;
}

export interface RolePermissionRow {
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface AccessRequestRow {
  id: string;
  user_id: string;
  company_id: string | null;
  requested_external_1c_id: string | null;
  requested_company_name: string | null;
  message: string | null;
  status: AccessRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitationRow {
  id: string;
  company_id: string;
  email: string;
  role_id: string;
  invited_by: string;
  accepted_by: string | null;
  status: InvitationStatus;
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    status: row.status,
    userType: row.user_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPartnerCompanyRow(row: PartnerCompanyRow): PartnerCompany {
  return {
    id: row.id,
    external1cId: row.external_1c_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCompanyMembershipRow(
  row: CompanyMembershipRow,
): CompanyMembership {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    roleId: row.role_id,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRoleRow(row: RoleRow): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    scope: row.scope,
    createdAt: row.created_at,
  };
}

export function mapPermissionRow(row: PermissionRow): Permission {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    createdAt: row.created_at,
  };
}

export function mapRolePermissionRow(row: RolePermissionRow): RolePermission {
  return {
    roleId: row.role_id,
    permissionId: row.permission_id,
    createdAt: row.created_at,
  };
}

export function mapAccessRequestRow(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    requestedExternal1cId: row.requested_external_1c_id,
    requestedCompanyName: row.requested_company_name,
    message: row.message,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapInvitationRow(row: InvitationRow): Invitation {
  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    roleId: row.role_id,
    invitedBy: row.invited_by,
    acceptedBy: row.accepted_by,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
