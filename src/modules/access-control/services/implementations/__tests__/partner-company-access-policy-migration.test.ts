import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260802120000_partner_company_access_policies.sql"),
  "utf8",
);
const projectionFix = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260802123000_partner_company_access_projection_qualification.sql"),
  "utf8",
);

describe("partner company access policy migration", () => {
  it("assigns an explicit full-access policy to every new company", () => {
    expect(sql).toContain("'full_partner_access', 'Full access'");
    expect(sql).toContain("create trigger initialize_partner_company_access");
    expect(sql).toContain("perform public.assign_default_partner_company_access(new.id");
    expect(sql).not.toMatch(/external_1c_price_type_id[\s\S]{0,120}full_partner_access/i);
  });

  it("keeps Gold, Platinum, and every commercial tier outside authorization", () => {
    expect(sql).not.toMatch(/\b(gold|platinum|msrp|service center)\b/i);
    expect(sql).toContain("Commercial tiers and 1C price types never select it");
  });

  it("intersects role grants with company capabilities and preserves deny", () => {
    expect(sql).toContain("role_code.code = 'company_users.manage'");
    expect(sql).toContain("or role_code.code = any(company_codes)");
    expect(sql).toContain("except select unnest(denied_codes) code");
    expect(sql).not.toContain("select unnest(role_codes || allowed_codes)");
  });

  it("does not make company user management a company capability", () => {
    const presetSeed = sql.slice(
      sql.indexOf("with preset_permissions"),
      sql.indexOf("create or replace function public.assign_default_partner_company_access"),
    );
    expect(presetSeed).not.toContain("company_users.manage");
    expect(sql).toContain("permission.code not in ('company_users.manage', 'prices.view')");
  });

  it("retains the legacy catalog pricing bridge without exposing it in the editor", () => {
    expect(sql).toContain("('full_partner_access', 'prices.view')");
    expect(sql).toContain("requested_codes || array['prices.view']");
    expect(sql).toContain("code in ('company_users.manage', 'prices.view')");
  });

  it("supports manual finance and order restriction plus full restore", () => {
    expect(sql).toContain("('full_partner_access', 'finance.view_company')");
    expect(sql).not.toContain("('catalog_only', 'finance.view_company')");
    expect(sql).toContain("('orders_only', 'orders.manage')");
    expect(sql).not.toContain("('catalog_only', 'orders.manage')");
  });

  it("audits updates and uses optimistic locking", () => {
    expect(sql).toContain("current_policy.version <> p_expected_version");
    expect(sql).toContain("stale_company_access_version");
    expect(sql).toContain("insert into public.partner_company_access_events");
    expect(sql).toContain("correlation_id uuid not null");
    expect(sql).toContain("prevent_partner_company_access_event_mutation");
  });

  it("backfills existing companies without queuing historical bootstrap work", () => {
    expect(sql).toContain("for company in select id from public.partner_companies loop");
    expect(sql).toContain("assign_default_partner_company_access(company.id, null, gen_random_uuid(), false)");
  });

  it("queues bootstrap work only for a newly initialized company", () => {
    expect(sql).toContain("create table public.partner_company_bootstrap_jobs");
    expect(sql).toContain("assign_default_partner_company_access(new.id, auth.uid(), gen_random_uuid(), true)");
    expect(sql).toContain("if p_enqueue_bootstrap then");
  });

  it("fails active membership creation when policy assignment is unavailable", () => {
    expect(sql).toContain("require_company_access_policy_for_active_membership");
    expect(sql).toContain("before insert or update on public.company_memberships");
    expect(sql).toContain("company_access_policy_required");
  });

  it("is idempotent and does not duplicate a company policy", () => {
    expect(sql).toContain("on conflict (company_id) do nothing");
    expect(sql).toContain("company_id uuid not null unique references public.partner_companies(id)");
  });

  it("fails safely when a company has no policy", () => {
    expect(sql).toMatch(/if not exists \([\s\S]*partner_company_access_policies[\s\S]*then return; end if;/);
  });

  it("qualifies runtime projection columns that overlap return-column names", () => {
    expect(projectionFix).toContain("membership.user_id = target_user.id");
    expect(projectionFix).toContain("membership.company_id = target_company.id");
    expect(projectionFix).toContain("role_permission.role_id = target_role.id");
    expect(projectionFix).not.toMatch(/where user_id = target_user\.id/);
  });

  it("defines all four preset modes", () => {
    expect(sql).toContain("('full_partner_access', 'Full access', 10)");
    expect(sql).toContain("('orders_only', 'Orders only', 20)");
    expect(sql).toContain("('catalog_only', 'Catalog only', 30)");
    expect(sql).toContain("('custom', 'Custom', 40)");
  });

  it("removes onboarding profile-derived overrides without touching price data", () => {
    expect(sql).toContain("clear_onboarding_derived_permission_overrides");
    expect(sql).toContain("after update of status on public.access_requests");
    expect(sql).not.toMatch(/update public\.partner_companies[\s\S]*external_1c_price_type_id/i);
  });
});
