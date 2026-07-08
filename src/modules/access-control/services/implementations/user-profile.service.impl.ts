import type {
  UserProfileRepository,
} from "../../repositories";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../../repositories";
import { UserStatus, type UserProfile } from "../../types";
import type {
  CreateProfileAfterSignupInput,
  UpdateOwnProfileInput,
  UserProfileService,
} from "../user-profile.service";
import {
  AccessControlError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  OperationNotAvailableError,
} from "../errors";

export class DefaultUserProfileService implements UserProfileService {
  constructor(private readonly userProfileRepository: UserProfileRepository) {}

  async getCurrentProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await this.userProfileRepository.findById(userId);
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async createProfileAfterSignup(
    input: CreateProfileAfterSignupInput,
  ): Promise<UserProfile> {
    try {
      return await this.userProfileRepository.create({
        id: input.userId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async updateOwnProfile(
    userId: string,
    input: UpdateOwnProfileInput,
  ): Promise<UserProfile> {
    try {
      return await this.userProfileRepository.updateOwnSafeFields(userId, {
        fullName: input.fullName,
        phone: input.phone,
      });
    } catch (error) {
      throw this.mapRepositoryError(error);
    }
  }

  async ensureActiveUser(userId: string): Promise<UserProfile> {
    const profile = await this.getCurrentProfile(userId);

    if (!profile) {
      throw new NotFoundError("User profile was not found.");
    }

    if (
      profile.status === UserStatus.Suspended ||
      profile.status === UserStatus.Revoked ||
      profile.status === UserStatus.Rejected
    ) {
      throw new ForbiddenError("User profile is not allowed to access portal.");
    }

    if (profile.status !== UserStatus.Active) {
      throw new InvalidStateError("User profile is not active.");
    }

    return profile;
  }

  private mapRepositoryError(error: unknown): AccessControlError {
    if (error instanceof RepositoryOperationNotAvailableError) {
      return new OperationNotAvailableError(error.message);
    }

    if (error instanceof RepositoryUnexpectedError) {
      return new AccessControlError();
    }

    if (error instanceof AccessControlError) {
      return error;
    }

    return new AccessControlError();
  }
}
