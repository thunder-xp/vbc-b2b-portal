import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260809130000_estimate_atomic_section_insertion.sql"), "utf8");
const repository = readFileSync(resolve("src/modules/estimates/repositories/supabase/estimate.supabase-repository.ts"), "utf8");
const editor = readFileSync(resolve("src/modules/estimates/components/EstimateCommercialEditor.tsx"), "utf8");

describe("estimate atomic section insertion migration", () => {
  it("keeps legacy RPCs intact and adds section-aware versioned contracts", () => {
    expect(sql).toContain("function public.add_estimate_items_v2(");
    expect(sql).toContain("function public.add_estimate_external_item_v2(");
    expect(sql).not.toContain("function public.add_estimate_items(");
    expect(sql).not.toContain("function public.add_estimate_external_item(");
    expect(repository).toContain('.rpc("add_estimate_items_v2"');
    expect(repository).toContain('.rpc("add_estimate_external_item_v2"');
  });

  it("validates section ownership and inserts directly into the selected section", () => {
    expect(sql).toContain("section.id = target_section_id and section.estimate_id = target.id");
    expect(sql).toContain("target.id,\n      target_section_id,");
    expect(sql).toContain("target.id, target_section_id, 'external'");
    expect(editor).not.toContain("addedIds.has(line.id) ? { ...line, sectionId: targetSectionId }");
  });

  it("makes retries idempotent without granting access to the ledger", () => {
    expect(sql).toContain("create table public.estimate_line_insertions");
    expect(sql).toContain("primary key (estimate_id, request_key)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'repeated', true");
    expect(sql).toContain("request_fingerprint <> target_request_fingerprint");
    expect(sql).toContain("alter table public.estimate_line_insertions enable row level security");
    expect(sql).toContain("revoke all on table public.estimate_line_insertions from public, anon, authenticated");
  });

  it("uses one governed mutation for each insertion mode", () => {
    expect(repository).toContain("target_section_id: input.targetSectionId");
    expect(repository).toContain("target_request_key: input.requestKey");
    expect(repository).not.toMatch(/addLines[\s\S]{0,900}update.*section/i);
  });
});
