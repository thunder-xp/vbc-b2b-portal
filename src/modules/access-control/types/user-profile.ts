export enum UserStatus {
  Registered = "registered",
  PendingApproval = "pending_approval",
  Active = "active",
  Suspended = "suspended",
  Revoked = "revoked",
  Rejected = "rejected",
}

export enum UserType {
  External = "external",
  Partner = "partner",
  Internal = "internal",
  Admin = "admin",
  System = "system",
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: UserStatus;
  userType: UserType;
  createdAt: string;
  updatedAt: string;
}
