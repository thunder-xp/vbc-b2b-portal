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
  roleId: string;
  invitedBy: string;
  acceptedBy: string | null;
  status: InvitationStatus;
  expiresAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
