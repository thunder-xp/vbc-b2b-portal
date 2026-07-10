import type { UserProfile } from "../types";

export interface CreateUserProfileInput {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
}

export interface UpdateOwnSafeUserProfileFieldsInput {
  fullName?: string | null;
  phone?: string | null;
}

export interface UserProfileRepository {
  findById(userId: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
  create(input: CreateUserProfileInput): Promise<UserProfile>;
  activatePartnerProfile(userId: string): Promise<UserProfile>;
  updateOwnSafeFields(
    userId: string,
    input: UpdateOwnSafeUserProfileFieldsInput,
  ): Promise<UserProfile>;
}
