import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727090000_admin_global_audit_history.sql",
  ),
  "utf8",
);

describe("global admin audit history migration", () => {
  it("allows an omitted context but rejects two simultaneous contexts", () => {
    expect(sql).toContain(
      "if p_company_id is not null and p_user_id is not null then",
    );
    expect(sql).not.toContain("Exactly one audit context is required.");
  });

  it("keeps global history permission-gated and bounded", () => {
    expect(sql).toContain(
      "public.has_internal_permission('admin.audit.view')",
    );
    expect(sql).toContain(
      "least(greatest(coalesce(p_page_size, 25), 1), 50)",
    );
    expect(sql).toContain(
      "revoke all on function public.list_admin_context_history(uuid, uuid, integer, integer)",
    );
    expect(sql).toContain("from public, anon");
  });

  it("preserves explicit company and user context filters", () => {
    expect(sql).toContain(
      "p_company_id is not null and event.company_id = p_company_id",
    );
    expect(sql).toContain(
      "p_user_id is not null and event.target_user_id = p_user_id",
    );
    expect(sql).toContain(
      "p_user_id is null or request.user_profile_id = p_user_id",
    );
  });
});
