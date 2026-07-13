import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260713170000_project_specifications_foundation.sql"), "utf8");

describe("project specification migration", () => {
  it("creates only the minimal specification and item tables", () => {
    expect(sql).toContain("create table public.project_specifications");
    expect(sql).toContain("create table public.project_specification_items");
    expect(sql).not.toMatch(/customer_email|customer_phone|pipeline|opportunity|order_id|price_amount|stock_quantity/i);
  });

  it("enables RLS and grants no anonymous access", () => {
    expect(sql).toContain("alter table public.project_specifications enable row level security");
    expect(sql).toContain("alter table public.project_specification_items enable row level security");
    expect(sql).toContain("revoke all on table public.project_specifications from anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete).*\s+to anon/i);
  });

  it("requires active company access and a dedicated permission", () => {
    expect(sql).toContain("permission.code = 'specifications.manage'");
    expect(sql).toContain("profile.status = 'active'");
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("company.status = 'active'");
  });

  it("submits non-empty drafts through a guarded RPC", () => {
    expect(sql).toContain("create or replace function public.submit_project_specification");
    expect(sql).toContain("target.status <> 'draft'");
    expect(sql).toContain("Project specification cannot be submitted without items");
    expect(sql).toContain("set status = 'submitted', submitted_at = now()");
    expect(sql).not.toMatch(/grant update \(status/i);
  });
});
