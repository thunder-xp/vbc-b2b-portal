import type {
  FailedRegistrationPurgeCompletion,
  FailedRegistrationPurgeLocalResult,
  FailedRegistrationPurgeReadiness,
} from "../types";

export type FailedRegistrationPurgeIdentity = {
  requestId: string;
  userId: string;
  email: string;
  applicationName: string;
};

export type PurgeFailedRegistrationLocalInput =
  FailedRegistrationPurgeIdentity & {
    actorUserId: string;
    correlationId: string;
  };

export interface FailedRegistrationPurgeRepository {
  getReadiness(
    input: { requestId: string } | FailedRegistrationPurgeIdentity,
  ): Promise<FailedRegistrationPurgeReadiness>;
  purgeLocal(
    input: PurgeFailedRegistrationLocalInput,
  ): Promise<FailedRegistrationPurgeLocalResult>;
  markAuthFailure(receiptId: string, safeErrorCode: string): Promise<void>;
  complete(receiptId: string): Promise<FailedRegistrationPurgeCompletion>;
}

export interface FailedRegistrationAuthAdminGateway {
  getUserEmail(userId: string): Promise<string | null>;
  deleteUser(userId: string): Promise<"deleted" | "already_missing">;
}
