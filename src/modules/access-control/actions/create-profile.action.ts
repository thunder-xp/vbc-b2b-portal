"use server";

import type { UserProfile, UserStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  success,
} from "./action-result";
import {
  createUserProfileService,
  getAuthenticatedUser,
} from "./service-factory";

export type CreateProfileActionInput = {
  fullName?: string | null;
  phone?: string | null;
};

export type CreatedProfileDto = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export async function createProfileAction(
  input: CreateProfileActionInput,
): Promise<ActionResult<CreatedProfileDto>> {
  try {
    const user = await getAuthenticatedUser();
    const profile = await createUserProfileService().createProfileAfterSignup({
      userId: user.id,
      email: user.email,
      fullName: normalizeOptionalText(input.fullName),
      phone: normalizeOptionalText(input.phone),
    });

    return success("Profile created.", toCreatedProfileDto(profile));
  } catch (error) {
    return failureFromError(error);
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function toCreatedProfileDto(profile: UserProfile): CreatedProfileDto {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    status: profile.status,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
