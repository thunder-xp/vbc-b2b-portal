import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260801210000_onboarding_directory_identity_integrity.sql"),
  "utf8",
);
const source = readFileSync(
  resolve("src/modules/onboarding/services/one-c-counterparty-directory.source.ts"),
  "utf8",
);
const wizard = readFileSync(
  resolve("src/modules/onboarding/components/OnboardingApprovalWizard.tsx"),
  "utf8",
);

describe("onboarding directory identity integrity", () => {
  it("uses one canonical fiscal-code function at database boundaries", () => {
    expect(migration).toContain("normalize_moldova_fiscal_code");
    expect(migration).toContain("access_requests_canonical_fiscal_code");
    expect(migration).toContain("onboarding_revisions_canonical_fiscal_code");
    expect(migration).toContain("one_c_counterparties_canonical_fiscal_code");
    expect(migration).toContain("normalized ~ '^[0-9]+$'");
  });

  it("refuses incomplete publication and preserves the previous snapshot", () => {
    expect(migration).toContain("sync.duplicate_counterparty_rows <> 0");
    expect(migration).toContain("sync.fetched_counterparties <> sync.staged_counterparties + sync.skipped_counterparties");
    const guard = migration.indexOf("Directory synchronization is incomplete.");
    const unpublish = migration.indexOf("update public.one_c_counterparties set is_published = false");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(unpublish);
  });

  it("uses a bounded complete collection instead of unstable overlapping pages", () => {
    expect(source).toContain("COMPLETE_COLLECTION_LIMIT = 5_000");
    expect(source).toContain("getLiteral");
    expect(source).toContain("$skip=0");
    expect(source).not.toContain("page * PAGE_SIZE");
  });

  it("keeps name suggestions non-authoritative and offers server-side rematching", () => {
    expect(migration).toContain("exact_name_fiscal_missing");
    expect(wizard).toContain("не могут быть выбраны без точного совпадения IDNO");
    expect(wizard).toContain("Повторно сопоставить после обновления справочника");
    expect(wizard).not.toMatch(/fetch\(|supabase|createClient|getOneCEnv/);
  });
});
