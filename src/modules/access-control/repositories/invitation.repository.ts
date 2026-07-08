import type { Invitation, InvitationStatus } from "../types";

export interface CreateInvitationInput {
  companyId: string;
  email: string;
  roleId: string;
  invitedBy: string;
  expiresAt?: string | null;
}

export interface UpdateInvitationStatusInput {
  id: string;
  status: InvitationStatus;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
}

export interface InvitationRepository {
  findPendingByEmail(email: string): Promise<Invitation | null>;
  findById(id: string): Promise<Invitation | null>;
  create(input: CreateInvitationInput): Promise<Invitation>;
  updateStatus(input: UpdateInvitationStatusInput): Promise<Invitation>;
}
