import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const queue = read("src/modules/onboarding/components/OnboardingQueueView.tsx");
const page = read("app/(admin)/admin/onboarding/[requestId]/page.tsx");
const repository = read("src/modules/onboarding/repositories/supabase-onboarding.repository.ts");
const migration = read("supabase/migrations/20260801170000_onboarding_detail_rpc_volatility_repair.sql");
const approval = read("supabase/migrations/20260731150000_onboarding_approval_wizard.sql");

describe("onboarding detail runtime repair", () => {
  it("uses access_requests.id consistently in the queue and detail repository", () => {
    expect(queue).toContain("href={`/admin/onboarding/${row.id}`}");
    expect(repository).toContain('p_request_id: requestId');
    expect(repository).toContain('client.rpc("get_onboarding_request_detail_v3"');
  });

  it("allows the detail RPC to initialize its idempotent approval draft", () => {
    expect(approval).toContain("on conflict (request_id) do nothing");
    expect(migration).toContain(
      "alter function public.get_onboarding_request_detail_v3(uuid) volatile",
    );
    expect(migration).not.toMatch(
      /alter function public\.get_onboarding_request_detail_v3\(uuid\) stable/i,
    );
  });

  it("uses 404 only for a missing application and 403 for denied access", () => {
    expect(page).toContain('result.errorCode === "ONBOARDING_APPLICATION_NOT_FOUND"');
    expect(page).toContain('result.errorCode === "ONBOARDING_ACCESS_DENIED"');
    expect(page).toContain("forbidden()");
    expect(page).not.toContain("if (!result.success || !result.data) notFound()");
  });

  it("retains atomic approval, company reuse, membership, role, and audit guarantees", () => {
    for (const contract of [
      "pg_advisory_xact_lock",
      "company_branch := 'reused'",
      "company_branch := 'created'",
      "membership_outcome := 'reused'",
      "membership_outcome := 'created'",
      "onboarding_approved",
      "role_id",
    ]) expect(approval).toContain(contract);
  });
});

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}
