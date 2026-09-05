import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260905101500_partner_final_customer_primary_email.sql"), "utf8");
const deliveryFoundationSql = readFileSync(resolve("supabase/migrations/20260718100000_proposal_delivery_foundation.sql"), "utf8");

describe("guided Estimate email migration", () => {
  it("extends the existing Final Customer owner with a normalized validated primary email", () => {
    expect(sql).toContain("alter table public.partner_final_customers");
    expect(sql).toContain("add column if not exists primary_email text null");
    expect(sql).toContain("primary_email = lower(btrim(primary_email))");
    expect(sql).toContain("partner_final_customers_primary_email_check");
    expect(sql).not.toMatch(/create table .*contact/i);
  });

  it("binds the email-only mutation to the attached Estimate, company, revision, and manage permission", () => {
    expect(sql).toContain("target_estimate.final_customer_id <> target_customer_id");
    expect(sql).toContain("target_customer.company_id <> target_estimate.company_id");
    expect(sql).toContain("target_customer.revision <> expected_revision");
    expect(sql).toContain("can_access_estimates(target_estimate.company_id, 'estimates.manage')");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("grant execute on function public.update_estimate_final_customer_email(uuid, uuid, integer, text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.update_estimate_final_customer_email[^;]+to anon/i);
  });

  it("rejects stale proposals and arbitrary PDFs while retaining both delivery rate limits", () => {
    expect(sql).toContain("estimate.revision = version.estimate_revision");
    expect(sql).toContain("document.id = target_document_id");
    expect(sql).toContain("document.version_id = version.id");
    expect(sql).toContain("document.company_id = version.company_id");
    expect(sql).toContain("Delivery rate limit exceeded");
    expect(sql).toContain("Recipient delivery rate limit exceeded");
  });

  it("reuses a failed delivery record for a bounded retry with a fresh private token", () => {
    expect(sql).toContain("if existing.status <> 'failed' then");
    expect(sql).toContain("set token_hash = target_token_hash");
    expect(sql).toContain("status = 'queued'");
    expect(sql).toContain("where id = existing.id");
    expect(deliveryFoundationSql).toContain("Delivery retry rate limit exceeded.");
  });

  it("stores no customer email in audit metadata and exposes no Service Role capability", () => {
    expect(sql).toContain("jsonb_build_array('primaryEmail')");
    expect(sql).not.toContain("jsonb_build_object('primaryEmail', normalized_email");
    expect(sql).not.toMatch(/service_role/i);
  });
});
