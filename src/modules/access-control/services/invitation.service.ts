import type { Invitation } from "../types";

export interface AcceptInvitationInput {
  userId: string;
  invitationId: string;
}

export interface RevokeInvitationInput {
  actorUserId: string;
  invitationId: string;
}

export interface InvitationService {
  getPendingInvitationsForEmail(email: string): Promise<Invitation[]>;
  acceptInvitation(input: AcceptInvitationInput): Promise<Invitation>;
  revokeInvitation(input: RevokeInvitationInput): Promise<Invitation>;
}
