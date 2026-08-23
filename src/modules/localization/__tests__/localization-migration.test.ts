import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260823192147_portal_localization_overlay.sql"), "utf8");
const machineDraftOrderingMigration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260823204500_order_localization_machine_drafts_by_version.sql"),
  "utf8",
);

describe("portal localization overlay migration", () => {
  it("keeps overlays generic, unique, private, and separate from commercial truth", () => {
    expect(migration).toContain("create table public.product_localizations");
    expect(migration).toContain("create table public.category_localizations");
    expect(migration).toMatch(/unique \(product_id, locale\)/);
    expect(migration).toMatch(/unique \(category_id, locale\)/);
    expect(migration).toContain("alter table public.product_localizations enable row level security");
    expect(migration).toMatch(/revoke all on table public\.product_localizations[\s\S]*from public, anon, authenticated/);
    const productTable = between("create table public.product_localizations", "create table public.category_localizations");
    expect(productTable).not.toMatch(/price|stock|warehouse|margin|contract/i);
  });

  it("hashes localization source fields but excludes commercial churn", () => {
    const hash = between("create or replace function public.product_localization_source_hash", "create or replace function public.category_localization_source_hash");
    expect(hash).toContain("product.name");
    expect(hash).toContain("product.full_description");
    expect(hash).toContain("catalog_product_attributes");
    expect(hash).toContain("localization_category_path_payload");
    expect(hash).not.toMatch(/product_prices|product_stock|warehouse|updated_at|synced_at/);
  });

  it("queues bounded source-bound jobs and rejects stale completions", () => {
    expect(migration).toContain("p_limit not between 1 and 25");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("attempt_count between 0 and 5");
    expect(migration).toContain("current_hash is distinct from p_source_hash");
    expect(migration).toContain("'stale_result_ignored'");
    expect(migration).toContain("status = 'superseded'");
  });

  it("merges current overlays into immutable snapshots without public runtime reads", () => {
    expect(migration).toContain("merge_product_localization_after_snapshot_insert");
    expect(migration).toContain("merge_category_localization_after_snapshot_insert");
    expect(migration).toContain("merge_terminology_after_snapshot_insert");
    expect(migration).toContain("translation_status in ('machine_draft','reviewed')");
    expect(migration).toContain("localization_merge_duration_ms");
    expect(migration).not.toMatch(/grant select on table public\.(product_localizations|category_localizations).*anon/i);
  });

  it("preserves append-only history and server-derived administration", () => {
    expect(migration).toContain("create table public.localization_revisions");
    expect(migration).toContain("create table public.localization_audit_events");
    expect(migration).toContain("Localization history is append-only.");
    expect(migration).toMatch(/grant execute on function[\s\S]*public\.manage_portal_localization[\s\S]*to service_role/);
    expect(migration).not.toMatch(/grant execute on function[\s\S]*public\.manage_portal_localization[\s\S]*to authenticated/);
    expect(migration).toContain("reverted_to_machine_draft");
  });

  it("exposes localized SEO only through the immutable public projection", () => {
    expect(migration).toContain("'seoTitle', case when p_locale = 'ro' then category.seo_title_ro else null end");
    expect(migration).toContain("'seoTitle', case when p_locale='ro' then product.seo_title_ro else null end");
    expect(migration).toContain("create or replace function public.list_public_retail_categories");
    expect(migration).toContain("create or replace function public.get_public_retail_product");
  });

  it("uses one governed terminology source for facets and translation jobs", () => {
    expect(migration).toContain("create table public.localization_terminology");
    expect(migration).toContain("merge_terminology_into_public_facets");
    expect(migration).toContain("jsonb_object_agg(term.source_term, term.localized_term");
  });

  it("selects the latest machine draft by governed version rather than transaction time", () => {
    expect(machineDraftOrderingMigration).toContain("localization_revisions_machine_draft_idx");
    expect(machineDraftOrderingMigration).toContain(
      "order by revision.translation_version desc,revision.id desc limit 1",
    );
    expect(machineDraftOrderingMigration).not.toContain(
      "order by revision.created_at desc,revision.id desc limit 1",
    );
  });
});

function between(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  return migration.slice(from, to);
}
