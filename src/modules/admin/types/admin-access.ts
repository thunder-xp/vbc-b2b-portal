export type AdminAccessCompanyContext = {
  companyId: string;
  companyName: string;
  membershipStatus: string;
};

export type AdminAccessSubject = {
  userId: string;
  fullName: string;
  email: string;
  identityType: "internal" | "partner";
  companyContexts: AdminAccessCompanyContext[];
};

export type AdminAccessPermission = {
  code: string;
  label: string;
  category: string;
  allowed: boolean;
  source: string;
  delegable: boolean;
  sensitive: boolean;
};

export type AdminAccessInspection = {
  userId: string;
  fullName: string;
  email: string;
  identityType: "internal" | "partner";
  profileStatus: string;
  companyId: string | null;
  companyName: string | null;
  companyStatus: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
  roleCode: string | null;
  roleName: string | null;
  permissions: AdminAccessPermission[];
};
