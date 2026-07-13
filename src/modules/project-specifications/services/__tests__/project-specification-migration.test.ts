import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260713170000_project_specifications_foundation.sql"), "utf8");
const reviewSql = fs.readFileSync(path.resolve("supabase/migrations/20260713190000_internal_specification_review.sql"), "utf8");

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

describe("internal specification review migration", () => {
  it("adds a narrow review capability and immutable snapshot columns", () => {
    expect(reviewSql).toContain("'specifications.review'");
    expect(reviewSql).toContain("product_name_snapshot");
    expect(reviewSql).toContain("partner_unit_price_amount");
    expect(reviewSql).toContain("available_stock");
    expect(reviewSql).toContain("snapshot_at");
  });

  it("keeps submission and review transitions atomic", () => {
    expect(reviewSql).toContain("create or replace function public.submit_project_specification_v2(");
    expect(reviewSql).toContain("create or replace function public.review_project_specification(");
    expect(reviewSql).toContain("for update;");
    expect(reviewSql).toContain("target.status <> 'submitted'");
    expect(reviewSql).toContain("target.status <> 'under_review'");
  });

  it("preserves the deployed submission RPC and grants while adding v2", () => {
    expect(reviewSql).not.toContain("drop function public.submit_project_specification(uuid)");
    expect(reviewSql).not.toContain("create or replace function public.submit_project_specification(");
    expect(reviewSql).toContain("grant execute on function public.submit_project_specification_v2(uuid, jsonb) to authenticated");
  });

  it("persists line and specification totals inside v2", () => {
    expect(reviewSql).toContain("partner_line_total_amount");
    expect(reviewSql).toContain("retail_line_total_amount");
    expect(reviewSql).toContain("partner_purchase_total_amount");
    expect(reviewSql).toContain("retail_total_amount");
    expect(reviewSql).toContain("gross_profit_usd_snapshot");
    expect(reviewSql).toContain("markup_percentage_snapshot");
  });

  it("creates a linked draft revision only inside the change-request RPC", () => {
    expect(reviewSql).toContain("if target_status = 'changes_requested' then");
    expect(reviewSql).toContain("parent_specification_id");
    expect(reviewSql).toContain("insert into public.project_specification_items");
  });

  it("grants no direct review update policy", () => {
    expect(reviewSql).not.toContain("grant update on table public.project_specifications");
    expect(reviewSql).not.toContain("for update\nto authenticated\nusing (public.can_review_project_specifications())");
  });
});
