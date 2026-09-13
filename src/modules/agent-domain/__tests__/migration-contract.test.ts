import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260913110307_commercial_agent_domain_foundation.sql"), "utf8");

describe("Commercial Agent foundation migration", () => {
  it("uses shared identity and preserves a 90-day historical attribution", () => {
    expect(sql).toContain("customer_identity_id uuid not null references public.customer_identities(id)");
    expect(sql).toContain("p_valid_from + interval '90 days'");
    expect(sql).toContain("agent_attributions_one_active_identity_idx");
    expect(sql).toContain("supersedes_attribution_id");
    expect(sql).not.toContain("partner_final_customer_id uuid");
    expect(sql).not.toContain("retail_customer_id uuid");
  });

  it("keeps Agent principals distinct and all tables service-only", () => {
    expect(sql).toContain("Agent principal must be an active external user without Partner membership.");
    expect(sql).toContain("Commercial Agent principal cannot receive Partner membership.");
    for (const table of ["commercial_agents", "agent_compliance", "agent_referral_tokens", "agent_referral_consents", "agent_referrals", "agent_attributions", "agent_domain_events"]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
    }
    expect(sql).not.toMatch(/commission_amount|commission_ledger|payout_amount/i);
  });
});
