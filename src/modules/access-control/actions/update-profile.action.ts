"use server";

import type { UserProfile, UserStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  success,
} from "./action-result";
import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "./service-factory";

export type UpdateOwnProfileActionInput = {
  fullName?: string | null;
  phone?: string | null;
};

export type UpdatedProfileDto = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export async function updateOwnProfileAction(
  input: UpdateOwnProfileActionInput = {},
): Promise<ActionResult<UpdatedProfileDto>> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().updateOwnProfile(userId, {
      fullName: normalizeOptionalText(input.fullName),
      phone: normalizeOptionalText(input.phone),
    });

    return success("Profile updated.", toUpdatedProfileDto(profile));
  } catch (error) {
    return failureFromError(error);
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toUpdatedProfileDto(profile: UserProfile): UpdatedProfileDto {
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
