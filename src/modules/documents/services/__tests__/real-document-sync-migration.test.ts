import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260801150000_real_one_c_document_metadata_sync.sql"), "utf8");

describe("real 1C document metadata migration", () => {
  it("maps company ownership only through the published counterparty directory", () => {
    expect(sql).toContain("join public.one_c_counterparties counterparty");
    expect(sql).toContain("counterparty.is_published");
    expect(sql).toContain("counterparty.portal_company_id is not null");
    expect(sql).not.toMatch(/company\.display_name\s*=|ilike.*counterparty/i);
  });

  it("creates order relations only from exact external references", () => {
    expect(sql).toContain("lower(history.external_1c_order_ref)=stage.order_ref");
    expect(sql).not.toMatch(/external_1c_order_number.*document_number/i);
  });

  it("uses staging, advisory locking, stale recovery, and atomic publication", () => {
    expect(sql).toContain("create table public.partner_document_sync_stage");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("stale_lock_recovered");
    expect(sql).toContain("create or replace function public.publish_partner_document_sync");
    expect(sql).not.toMatch(/delete from public\.partner_documents/i);
  });

  it("keeps source rows metadata-only and server-only", () => {
    expect(sql).toContain("'metadata_only'");
    expect(sql).toContain("revoke all on public.partner_document_sync_stage from public, anon, authenticated");
    expect(sql).not.toMatch(/Base64|ФайлХранилище|storage_key.*stage/i);
  });

  it("deduplicates synchronization audit and partner notifications by source version", () => {
    expect(sql).toContain("partner_document_audit_sync_version_idx");
    expect(sql).toContain("on conflict(fingerprint) do nothing");
    expect(sql).toContain("on conflict(recipient_user_id,deduplication_key) do nothing");
    expect(sql).toContain("event_group='documents'");
  });
});
