export enum InvitationStatus {
  Pending = "pending",
  Accepted = "accepted",
  Expired = "expired",
  Revoked = "revoked",
}

export interface Invitation {
  id: string;
  companyId: string;
  email: string;
  fullName?: string | null;
  roleId: string;
  invitedBy: string;
  acceptedBy: string | null;
  status: InvitationStatus;
  expiresAt: string | null;
  revokedAt?: string | null;
  lastSentAt?: string | null;
  sendCount?: number;
  tokenVersion?: number;
  acceptedMembershipId?: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
