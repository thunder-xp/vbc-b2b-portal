import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/src/lib/supabase/server";

import { RepositoryProfileCreationError } from "../../index";
import { SupabaseUserProfileRepository } from "../user-profile.supabase-repository";

vi.mock("@/src/lib/supabase/server", () => ({ createClient: vi.fn() }));

const correlationId = "8d216433-29d4-4785-9506-50ad2d515b04";
const profile = {
  id: "3bc8a2c9-3107-42ab-8f12-bcb020b2e494",
  email: "partner@example.com",
  full_name: "Partner User",
  phone: "+37367497101",
  preferred_locale: "ru",
  status: "registered",
  user_type: "external",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

describe("SupabaseUserProfileRepository.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    "CREATED",
    "PROFILE_ALREADY_EXISTS",
    "RECOVERED",
  ] as const)("maps the %s idempotent outcome to the canonical profile", async (code) => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, code, correlationId, profile },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const result = await new SupabaseUserProfileRepository().create({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      correlationId,
    });

    expect(rpc).toHaveBeenCalledWith("create_own_user_profile_v1", {
      p_full_name: profile.full_name,
      p_phone: profile.phone,
      p_correlation_id: correlationId,
    });
    expect(result).toMatchObject({ phone: profile.phone });
  });

  it.each([
    "PHONE_ALREADY_IN_USE",
    "ONBOARDING_STATE_CONFLICT",
    "INVALID_PHONE",
    "TEMPORARY_SERVER_ERROR",
  ] as const)("preserves safe %s failures", async (code) => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code, correlationId },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    await expect(new SupabaseUserProfileRepository().create({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      phone: profile.phone,
      correlationId,
    })).rejects.toMatchObject({
      name: "RepositoryProfileCreationError",
      code,
      correlationId,
    } satisfies Partial<RepositoryProfileCreationError>);
  });
});
