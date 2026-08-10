import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260810100000_external_nomenclature_governance.sql"), "utf8");
const coverPathFixSql = readFileSync(resolve("supabase/migrations/20260810110000_fix_nomenclature_cover_path_validation.sql"), "utf8");
const coverConstraintFixSql = readFileSync(resolve("supabase/migrations/20260810111000_fix_nomenclature_cover_shape_constraints.sql"), "utf8");
describe("external nomenclature governance migration", () => {
  it("keeps canonical identity separate from company presentation", () => {
    expect(sql).toContain("curation_status text not null default 'review_required'");
    expect(sql).toContain("canonical_cover_storage_key");
    expect(sql).toContain("alter table public.partner_external_nomenclature_library");
    expect(sql).toContain("cover_storage_key text null");
  });
  it("uses private WebP-only storage and server-governed paths", () => {
    expect(sql).toContain("'partner-nomenclature-covers', 'partner-nomenclature-covers', false");
    expect(sql).toContain("array['image/webp']");
    expect(sql).toContain("target_storage_key !~ ('^partner/'");
    expect(sql).toContain("target_storage_key !~ ('^canonical/'");
  });
  it("enforces partner and internal permissions without direct event mutation", () => {
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.manage')");
    expect(sql).toContain("admin.external_nomenclature.manage");
    expect(sql).toContain("revoke all on table public.external_nomenclature_governance_events from public, anon, authenticated");
    expect(sql).toContain("events are immutable");
  });
  it("keeps search bounded, company-safe, and redirects future adoption only", () => {
    expect(sql).toContain("least(greatest(coalesce(result_limit, 8), 1), 12)");
    expect(sql).toContain("search_scope = 'shared' and item.curation_status = 'active'");
    expect(sql).toContain("update public.external_nomenclature_items set canonical_item_id=canonical.id");
    expect(sql).not.toMatch(/update public\.estimate_items[\s\S]{0,200}external_nomenclature_id/);
  });
  it("uses optimistic versions and append-only cover/curation events", () => {
    expect(sql).toContain("library.version <> expected_version");
    expect(sql).toContain("item.version<>expected_version");
    expect(sql).toContain("canonical_cover_uploaded");
    expect(sql).toContain("duplicate_redirected");
  });
  it("accepts generated partner and canonical WebP storage keys", () => {
    expect(coverPathFixSql).toContain("/[0-9a-f-]{36}\\.webp$");
    expect(coverPathFixSql).not.toContain("/[0-9a-f-]{36}\\\\.webp$");
    expect(coverPathFixSql).toContain("^partner/");
    expect(coverPathFixSql).toContain("^canonical/");
    expect(coverConstraintFixSql).toContain("^partner/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$");
    expect(coverConstraintFixSql).toContain("^canonical/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$");
    expect(coverConstraintFixSql).not.toContain("{36}\\\\.webp$");
  });
});
