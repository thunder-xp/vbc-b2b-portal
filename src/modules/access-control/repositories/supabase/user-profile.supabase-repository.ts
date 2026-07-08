import { createClient } from "@/src/lib/supabase/server";

import type {
  CreateUserProfileInput,
  UpdateOwnSafeUserProfileFieldsInput,
  UserProfileRepository,
} from "../index";
import type { UserProfile } from "../../types";
import {
  mapUserProfileRow,
  type UserProfileRow,
} from "./mappers";
import {
  RepositoryOperationNotAvailableError,
  RepositoryUnexpectedError,
} from "../index";

const USER_PROFILE_COLUMNS =
  "id, email, full_name, phone, status, user_type, created_at, updated_at";

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

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    void input;
    throw new RepositoryOperationNotAvailableError("user_profiles.create");
  }

  async updateOwnSafeFields(
    userId: string,
    input: UpdateOwnSafeUserProfileFieldsInput,
  ): Promise<UserProfile> {
    const supabase = await createClient();
    const updatePayload: {
      full_name?: string | null;
      phone?: string | null;
    } = {};

    if (input.fullName !== undefined) {
      updatePayload.full_name = input.fullName;
    }

    if (input.phone !== undefined) {
      updatePayload.phone = input.phone;
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
