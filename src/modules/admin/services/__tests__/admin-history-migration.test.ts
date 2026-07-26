import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726165000_admin_context_history.sql",
  ),
  "utf8",
).toLowerCase();

describe("admin context history migration", () => {
  it("requires protected audit access and exactly one real context", () => {
    expect(sql).toContain(
      "public.has_internal_permission('admin.audit.view')",
    );
    expect(sql).toContain(
      "if (p_company_id is null) = (p_user_id is null)",
    );
    expect(sql).toContain("from public.partner_companies company");
    expect(sql).toContain("from public.user_profiles profile");
  });

  it("combines existing append-only sources in one bounded query", () => {
    expect(sql).toContain("from public.company_user_events event");
    expect(sql).toContain(
      "from public.internal_role_assignment_audit_events event",
    );
    expect(sql).toContain("from public.access_requests request");
    expect(sql).toContain(
      "least(greatest(coalesce(p_page_size, 25), 1), 50)",
    );
    expect(sql).toContain("count(*) over()");
  });

  it("returns safe projections rather than raw payloads or invitation tokens", () => {
    const signature = sql.slice(
      sql.indexOf("returns table"),
      sql.indexOf("language plpgsql"),
    );
    expect(signature).not.toContain("safe_payload");
    expect(signature).not.toContain("token");
    expect(signature).not.toContain("password");
    expect(signature).not.toContain("session");
    expect(sql).toContain("excludes invitation tokens");
  });

  it("grants only RPC execution and no direct writes", () => {
    expect(sql).toContain(
      "grant execute on function public.list_admin_context_history",
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table/);
  });
});
