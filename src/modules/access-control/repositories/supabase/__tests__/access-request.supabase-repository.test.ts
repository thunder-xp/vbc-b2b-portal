import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@/src/lib/supabase/server";

import { RepositoryUnexpectedError } from "../../index";
import { AccessRequestStatus } from "../../../types";
import { SupabaseAccessRequestRepository } from "../access-request.supabase-repository";

vi.mock("@/src/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const accessRequestRow = {
  id: "request-1",
  user_profile_id: "user-1",
  company_id: null,
  requested_external_1c_id: null,
  requested_company_name: "Partner Company",
  requested_fiscal_code: "BG123456789",
  contact_phone: "+359 1 234",
  message: "Please review.",
  status: AccessRequestStatus.PendingReview,
  reviewed_by: null,
  reviewed_at: null,
  decision_reason: null,
  created_at: "2026-07-09T00:00:00.000Z",
  updated_at: "2026-07-09T00:00:00.000Z",
};

describe("SupabaseAccessRequestRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates requests in access_requests using user_profile_id", async () => {
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const from = vi.fn().mockReturnValue({ insert });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const repository = new SupabaseAccessRequestRepository();

    const result = await repository.create({
      userId: "user-1",
      requestedCompanyName: "Partner Company",
      requestedFiscalCode: "BG123456789",
      contactPhone: "+359 1 234",
      message: "Please review.",
    });

    expect(from).toHaveBeenCalledWith("access_requests");
    expect(from).not.toHaveBeenCalledWith("partner_access_requests");
    expect(insert).toHaveBeenCalledWith({
      id: expect.any(String),
      user_profile_id: "user-1",
      requested_company_name: "Partner Company",
      requested_fiscal_code: "BG123456789",
      contact_phone: "+359 1 234",
      message: "Please review.",
    });
    expect(JSON.stringify(insert.mock.calls)).not.toContain("user_id");
    expect(JSON.stringify(insert.mock.calls)).not.toContain("company_id");
    expect(result.userId).toBe("user-1");
    expect(result.id).toEqual(expect.any(String));
  });

  it("queries own requests by user_profile_id from access_requests", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [accessRequestRow],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const repository = new SupabaseAccessRequestRepository();

    const result = await repository.findByUserId("user-1");

    expect(from).toHaveBeenCalledWith("access_requests");
    expect(from).not.toHaveBeenCalledWith("partner_access_requests");
    expect(eq).toHaveBeenCalledWith("user_profile_id", "user-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("user-1");
  });

  it("preserves original Supabase insert error diagnostics", async () => {
    const supabaseError = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: "RLS blocked insert",
      hint: "Check policy",
    };
    const insert = vi.fn().mockResolvedValue({
      data: null,
      error: supabaseError,
    });
    const from = vi.fn().mockReturnValue({ insert });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const repository = new SupabaseAccessRequestRepository();

    await expect(
      repository.create({
        userId: "user-1",
        requestedCompanyName: "Partner Company",
      }),
    ).rejects.toMatchObject({
      name: "RepositoryUnexpectedError",
      operation: "access_requests.create",
      table: "access_requests",
      payloadKeys: expect.arrayContaining([
        "id",
        "user_profile_id",
        "requested_company_name",
      ]),
      cause: supabaseError,
    } satisfies Partial<RepositoryUnexpectedError>);

    expect(consoleError).toHaveBeenCalledWith(
      "[access-control-repository] Supabase operation failed",
      expect.objectContaining({
        operation: "access_requests.create",
        table: "access_requests",
        code: "42501",
        message: "new row violates row-level security policy",
        details: "RLS blocked insert",
        hint: "Check policy",
        payloadKeys: expect.arrayContaining(["id", "user_profile_id"]),
      }),
    );

    consoleError.mockRestore();
  });
});

describe("access_requests canonical owner migration", () => {
  it("removes legacy user_id requirement and keeps RLS on user_profile_id", () => {
    const migrationSql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260710070500_access_requests_user_profile_id_canonical.sql",
      ),
      "utf8",
    );

    expect(migrationSql).toContain("set user_profile_id = user_id");
    expect(migrationSql).toContain("drop column if exists user_id cascade");
    expect(migrationSql).toContain("user_profile_id = auth.uid()");
    expect(migrationSql).toContain("grant select on table public.access_requests to authenticated");
    expect(migrationSql).toContain("grant insert on table public.access_requests to authenticated");
    expect(migrationSql).not.toContain("create table public.partner_access_requests");
  });
});
