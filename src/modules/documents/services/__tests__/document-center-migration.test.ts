import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260801090000_partner_document_center_foundation.sql"), "utf8");

describe("partner document center migration", () => {
  it("defines the governed taxonomy and canonical relations", () => {
    expect(sql).toContain("create table public.partner_documents");
    expect(sql).toContain("create table public.partner_document_products");
    expect(sql).toContain("create table public.partner_document_orders");
    expect(sql).toContain("'invoice','fiscal_invoice','delivery_note'");
  });

  it("enforces company isolation and granular accounting access in SQL", () => {
    expect(sql).toContain("alter table public.partner_documents enable row level security");
    expect(sql).toContain("document.company_id = p_company_id");
    expect(sql).toContain("documents.view_accounting");
    expect(sql).toContain("revoke all on public.partner_documents");
  });

  it("keeps protected retrieval references out of partner list and detail projections", () => {
    const listFunction = sql.slice(sql.indexOf("create or replace function public.list_partner_documents"), sql.indexOf("create or replace function public.get_partner_document"));
    expect(listFunction).not.toContain("storage_key");
    expect(listFunction).not.toContain("source_retrieval_reference");
    expect(sql).toContain("authorize_partner_document_download");
  });

  it("defaults to current versions and preserves failed-sync snapshots", () => {
    expect(sql).toContain("document.is_current");
    expect(sql).toContain("partner_documents_portal_checksum_idx");
    expect(sql).not.toContain("truncate public.partner_documents");
    expect(sql).not.toContain("delete from public.partner_documents where source_system='onec'");
  });

  it("does not duplicate portal-owned product documents through the catalog projection", () => {
    expect(sql).toContain("source.url not like '/api/documents/%/download'");
    expect(sql).toContain("if new.url like '/api/documents/%/download'");
  });

  it("records safe download audit and configures private PDF storage", () => {
    expect(sql).toContain("record_partner_document_download");
    expect(sql).toContain("event_type in ('synchronized','published','replaced','archived','accessed','downloaded','download_failed')");
    expect(sql).toContain("values ('partner-documents', 'partner-documents', false");
    expect(sql).toContain("application/pdf");
  });
});
