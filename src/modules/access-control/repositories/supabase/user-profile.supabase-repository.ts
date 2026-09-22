import { createClient } from "@/src/lib/supabase/server";

import type {
  CreateUserProfileInput,
  UpdateOwnSafeUserProfileFieldsInput,
  UserProfileRepository,
} from "../index";
import type { UserProfile } from "../../types";
import { UserStatus, UserType } from "../../types";
import {
  mapUserProfileRow,
  type UserProfileRow,
} from "./mappers";
import {
  RepositoryProfileCreationError,
  RepositoryUnexpectedError,
} from "../index";
import { z } from "zod";

const USER_PROFILE_COLUMNS =
  "id, email, full_name, phone, preferred_locale, status, user_type, created_at, updated_at";

const profileCreationResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    code: z.enum(["CREATED", "PROFILE_ALREADY_EXISTS", "RECOVERED"]),
    correlationId: z.string().uuid(),
    profile: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      full_name: z.string().nullable(),
      phone: z.string().nullable(),
      preferred_locale: z.enum(["ru", "ro"]).nullable(),
      status: z.string(),
      user_type: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      "AUTH_REQUIRED",
      "PHONE_ALREADY_IN_USE",
      "ONBOARDING_STATE_CONFLICT",
      "INVALID_PHONE",
      "TEMPORARY_SERVER_ERROR",
    ]),
    correlationId: z.string().uuid(),
  }),
]);

export class SupabaseUserProfileRepository implements UserProfileRepository {
  async findById(userId: string): Promise<UserProfile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapUserProfileRow(data as UserProfileRow) : null;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_COLUMNS)
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return data ? mapUserProfileRow(data as UserProfileRow) : null;
  }

  async create(input: CreateUserProfileInput) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("create_own_user_profile_v1", {
        p_full_name: input.fullName ?? null,
        p_phone: input.phone ?? null,
        p_correlation_id: input.correlationId,
      });

    if (error) {
      throw new RepositoryUnexpectedError({
        operation: "create_own_user_profile_v1",
        table: "user_profiles",
        payloadKeys: ["fullName", "phone", "correlationId"],
        cause: error,
      });
    }

    const result = profileCreationResultSchema.parse(data);
    if (!result.ok) {
      throw new RepositoryProfileCreationError(result.code, result.correlationId);
    }

    return mapUserProfileRow(result.profile as UserProfileRow);
  }

  async activatePartnerProfile(userId: string): Promise<UserProfile> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .update({
        status: UserStatus.Active,
        user_type: UserType.Partner,
      })
      .eq("id", userId)
      .select(USER_PROFILE_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapUserProfileRow(data as UserProfileRow);
  }

  async updateOwnSafeFields(
    userId: string,
    input: UpdateOwnSafeUserProfileFieldsInput,
  ): Promise<UserProfile> {
    const supabase = await createClient();
    const updatePayload: {
      full_name?: string | null;
      phone?: string | null;
      preferred_locale?: "ru" | "ro" | null;
    } = {};

    if (input.fullName !== undefined) {
      updatePayload.full_name = input.fullName;
    }

    if (input.phone !== undefined) {
      updatePayload.phone = input.phone;
    }

    if (input.preferredLocale !== undefined) {
      updatePayload.preferred_locale = input.preferredLocale;
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updatePayload)
      .eq("id", userId)
      .select(USER_PROFILE_COLUMNS)
      .single();

    if (error) {
      throw new RepositoryUnexpectedError();
    }

    return mapUserProfileRow(data as UserProfileRow);
  }
}
