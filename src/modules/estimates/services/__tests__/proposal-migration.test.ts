import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260716160000_estimate_proposals_and_documents.sql"), "utf8");

describe("estimate proposal migration", () => {
  it("creates templates, private artifacts, RLS, and no authenticated writes", () => {
    for (const table of ["proposal_templates", "company_proposal_profiles", "generated_estimate_documents"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain("values ('estimate-proposals', 'estimate-proposals', false");
    expect(sql).toContain("grant select on table public.proposal_templates");
    expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.generated_estimate_documents to authenticated/i);
  });
  it("guards settings and generation through company permissions", () => {
    expect(sql).toContain("'estimates.manage'");
    expect(sql).toContain("'estimates.generate_pdf'");
    expect(sql).toContain("target.has_incomplete_pricing");
    expect(sql).toContain("unique (company_id, generation_fingerprint)");
  });
  it("seeds exactly four structured system templates", () => {
    for (const key of ["equipment_supply", "equipment_installation", "integrated_solution", "service_offer"]) expect(sql).toContain(`('${key}'`);
  });
});
