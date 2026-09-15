import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(join(process.cwd(),"supabase/migrations/20260915185659_installation_marketplace_closed_loop_v1.sql"),"utf8").toLowerCase();

describe("Installation Marketplace migration contract",()=>{
  it("creates the closed-loop aggregate with forced RLS",()=>{
    for(const table of ["installation_projects","installation_project_items","installation_partner_assignments","installation_project_events","installation_reviews"]){
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("derives customer and partner identity server-side and never accepts browser ownership",()=>{
    expect(sql).toContain("a.auth_user_id = auth.uid()");
    expect(sql).toContain("m.user_id=auth.uid() and m.company_id=p_company_id");
    expect(sql).not.toContain("p_customer_account_id");
    expect(sql).not.toContain("p_customer_identity_id");
  });

  it("preserves privacy until acceptance and permits one active assignment",()=>{
    expect(sql).toContain("where status in ('partner_pending','partner_accepted')");
    expect(sql).toContain("case when a.status='partner_accepted' and p.contact_consent_at is not null");
    expect(sql).toContain("'contact', case when a.status='partner_accepted'");
  });

  it("enforces completion-gated one-per-project verified reviews",()=>{
    expect(sql).toContain("project_id uuid not null unique");
    expect(sql).toContain("verification_status text not null default 'verified_installation'");
    expect(sql).toContain("project.status not in ('customer_confirmed','closed')");
  });

  it("keeps the V1 boundary free of pricing, payment and SMS behavior",()=>{
    expect(sql).not.toContain("provider_price");
    expect(sql).not.toContain("payment_attempt");
    expect(sql).not.toContain("send_sms");
    expect(sql).not.toContain("service_role_key");
  });
});
