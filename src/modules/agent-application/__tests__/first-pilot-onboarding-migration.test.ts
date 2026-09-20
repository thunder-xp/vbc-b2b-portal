import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260920201440_commercial_agent_first_pilot_onboarding_v1.sql"), "utf8");

describe("Commercial Agent first-pilot onboarding migration", () => {
  it("keeps draft creation service-role only and derives identity email from Auth", () => {
    expect(sql).toContain("from auth.users identity");
    expect(sql).toContain("identity_email");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant execute[^;]+to authenticated/i);
  });

  it("uses registration metadata only as bounded prefill and preserves an explicit profile locale", () => {
    expect(sql).toContain("p_registration_legal_form");
    expect(sql).toContain("p_preferred_locale in ('ru', 'ro')");
    expect(sql).toContain("public.user_profiles.preferred_locale is null");
    expect(sql).toContain("existing.status = 'DRAFT'");
  });

  it("requires a phone before an application leaves its draft lifecycle", () => {
    expect(sql).toContain("commercial_agent_applications_submitted_phone_check");
    expect(sql).toContain("status in ('DRAFT', 'WITHDRAWN')");
    expect(sql).toContain("phone is not null");
  });
});
