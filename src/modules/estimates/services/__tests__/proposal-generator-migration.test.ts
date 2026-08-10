import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260810130000_proposal_generator_mvp.sql"), "utf8");

describe("proposal generator MVP migration", () => {
  it("creates one atomic hand-off into canonical estimates with bounded input", () => {
    expect(sql).toContain("create or replace function public.create_estimate_from_generator");
    expect(sql).toContain("public.create_estimate_v3");
    expect(sql).toContain("jsonb_array_length(generated_lines) > 30");
    expect(sql).toContain("where estimate_id = created.id and system_key = line->>'section_key'");
    expect(sql).not.toContain("Document_ЗаказПокупателя");
  });
  it("preserves governed identities, null external prices, and tenant access", () => {
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.manage')");
    expect(sql).toContain("product.is_active and product.is_visible");
    expect(sql).toContain("partner_external_nomenclature_library");
    expect(sql).toContain("external_item.unit, null");
  });
  it("stores bounded metrics without raw requirement text and immutable feedback", () => {
    expect(sql).toContain("estimate_generator_sessions");
    expect(sql).toContain("estimate_generator_feedback");
    expect(sql).toContain("Generator feedback is immutable.");
    expect(sql).not.toMatch(/requirement_text|raw_requirement|prompt_text/i);
    expect(sql).toContain("admin.estimates.view");
  });
  it("revokes tables and uses explicit search paths", () => {
    expect(sql).toContain("revoke all on table public.estimate_generator_sessions, public.estimate_generator_feedback from public, anon, authenticated");
    expect(sql).toContain("security definer set search_path = public");
  });
});
