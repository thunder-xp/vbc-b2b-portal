import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve("supabase/migrations/20260916050131_installation_marketplace_partner_activation_v1.sql"),"utf8").toLowerCase();

describe("Installation Marketplace Partner Activation V1 migration",()=>{
  it("extends the canonical company-backed provider instead of creating partner identity",()=>{
    expect(sql).toContain("alter table public.installation_providers");
    expect(sql).toContain("partner_company_id=p_company_id");
    expect(sql).not.toMatch(/create table public\.(marketplace_partner|installation_partner_identity)/);
    expect(sql).not.toContain("insert into public.partner_companies");
  });

  it("requires explicit opt-in and the complete governed lifecycle",()=>{
    expect(sql).toContain("partner_opt_in_installation_marketplace_v1");
    for(const status of ["not_enrolled","draft","pending_review","approved","active","suspended","rejected"]) expect(sql).toContain(`'${status}'`);
    expect(sql).toContain("marketplace_enabled and new.participation_status<>'active'");
  });

  it("keeps company authorization server-side with forced RLS and locked definer paths",()=>{
    expect(sql).toContain("has_active_company_membership(p_company_id)");
    expect(sql).toContain("has_permission(p_company_id,'installation_marketplace.manage')");
    expect(sql).toContain("has_internal_permission('admin.retail_marketplace.manage')");
    expect(sql).toContain("security definer set search_path=''");
    for(const table of ["installation_providers","installation_provider_profiles","installation_provider_competencies","installation_provider_regions","retail_marketplace_events"]) expect(sql).toContain(`alter table public.${table} force row level security`);
  });

  it("stores bounded self-declared capabilities, geography, privacy, terms and Admin verification",()=>{
    for(const capability of ["cctv","intercom","access_control","alarm","network","other"]) expect(sql).toContain(`'${capability}'`);
    expect(sql).toContain("declaration_status in ('self_declared','verified')");
    expect(sql).toContain("provider_terms_accepted");
    expect(sql).toContain("provider_privacy_acknowledged");
    expect(sql).toContain("admin_review_installation_partner_activation_v1");
  });

  it("uses in-app lifecycle notifications and leaves Ranking V2, pricing, payouts and SMS untouched",()=>{
    expect(sql).toContain("insert into public.partner_notifications");
    expect(sql).toContain("email_enabled_snapshot,email_delivery_mode");
    expect(sql).toContain("false,'off'");
    expect(sql).not.toMatch(/send_sms|sms_delivery|commission|payout|provider_price|installation_ranking_decisions/);
  });
});
