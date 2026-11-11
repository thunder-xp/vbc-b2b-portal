"use server";

import { randomUUID } from "node:crypto";

import type { UserProfile, UserStatus } from "../types";
import {
  type ActionResult,
  failureFromError,
  success,
} from "./action-result";
import {
  createUserProfileService,
  getAuthenticatedUser,
  getAuthenticatedUserId,
} from "./service-factory";

export type CurrentProfileDto = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export async function getCurrentProfileAction(): Promise<
  ActionResult<CurrentProfileDto | null>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().getCurrentProfile(userId);

    return success(
      profile ? "Current profile loaded." : "Profile is missing.",
      profile ? toCurrentProfileDto(profile) : null,
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function ensureCurrentProfileAction(): Promise<
  ActionResult<CurrentProfileDto>
> {
  try {
    const user = await getAuthenticatedUser();
    const profile = await createUserProfileService().ensureProfileAfterAuthentication({
      userId: user.id,
      email: user.email,
      correlationId: randomUUID(),
    });
    return success("Current profile is ready.", toCurrentProfileDto(profile));
  } catch (error) {
    return failureFromError(error);
  }
}

function toCurrentProfileDto(profile: UserProfile): CurrentProfileDto {
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
