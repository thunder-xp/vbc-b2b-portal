import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  "supabase/migrations/20260827101829_admin_company_logo_management.sql",
), "utf8");

describe("admin company logo migration", () => {
  it("uses the canonical company logo and preserves the approved public snapshot opt-in", () => {
    expect(sql).toContain("logo_asset_path = target_path");
    expect(sql).toContain("public_directory_logo_asset_path = approved_logo_path");
    expect(sql).toContain("target.public_directory_logo_asset_path = target.logo_asset_path");
    expect(sql).not.toMatch(/add column[^;]*(public_logo|admin_logo)/i);
  });

  it("requires explicit internal permission and optimistic locking", () => {
    expect(sql).toContain("public.has_internal_permission('admin.catalog.manage')");
    expect(sql).toContain("for update");
    expect(sql).toContain("ADMIN_COMPANY_LOGO_CONFLICT");
    expect(sql).toContain("errcode = 'PT409'");
    expect(sql).toContain("revoke all on function public.update_admin_partner_company_logo");
  });

  it("enforces company-owned image paths and appends immutable audit events", () => {
    expect(sql).toContain("'^' || p_company_id::text");
    expect(sql).toContain("|| '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}");
    expect(sql).toContain("company_logo_uploaded");
    expect(sql).toContain("company_logo_replaced");
    expect(sql).toContain("company_logo_removed");
    expect(sql).toContain("public.public_partner_directory_governance_events");
    expect(sql).not.toMatch(/update\s+public\.public_partner_directory_governance_events/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.public_partner_directory_governance_events/i);
  });

  it("does not grant table or storage access to partner or anonymous roles", () => {
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*partner_companies[\s\S]*to\s+(anon|authenticated)/i,
    );
    expect(sql).not.toMatch(/storage\.objects|storage\.buckets/i);
  });
});
