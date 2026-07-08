import type { UserProfile } from "../types";

export interface CreateProfileAfterSignupInput {
  userId: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
}

export interface UpdateOwnProfileInput {
  fullName?: string | null;
  phone?: string | null;
}

export interface UserProfileService {
  getCurrentProfile(userId: string): Promise<UserProfile | null>;
  createProfileAfterSignup(
    input: CreateProfileAfterSignupInput,
  ): Promise<UserProfile>;
  updateOwnProfile(
    userId: string,
    input: UpdateOwnProfileInput,
  ): Promise<UserProfile>;
  ensureActiveUser(userId: string): Promise<UserProfile>;
}
