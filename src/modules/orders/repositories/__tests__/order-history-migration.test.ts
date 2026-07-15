import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260715100000_partner_order_history_read_model.sql"),
  "utf8",
);

describe("partner order history migration", () => {
  it("keeps 1C history separate from immutable portal submissions", () => {
    expect(sql).toContain("create table if not exists public.partner_order_history");
    expect(sql).toContain("portal_order_id uuid null unique references public.partner_orders");
    expect(sql).not.toMatch(/alter table public\.partner_order_items[\s\S]*drop/i);
  });

  it("deduplicates history by Ref_Key rather than Number", () => {
    expect(sql).toContain("external_1c_order_ref text not null unique");
    expect(sql).not.toContain("external_1c_order_number text not null unique");
    expect(sql).toContain("on conflict (external_1c_order_ref)");
  });

  it("retains deleted rows but blocks partner visibility", () => {
    expect(sql).toContain("one_c_deletion_mark boolean not null");
    expect(sql).toContain("partner_visible boolean not null");
    expect(sql).toContain("'deleted_in_1c'");
    expect(sql).not.toMatch(/delete from public\.partner_order_history\s+where/i);
  });

  it("allows browser roles to select only through company permission and visibility RLS", () => {
    expect(sql).toContain("alter table public.partner_order_history enable row level security");
    expect(sql).toContain("public.has_permission(target_company_id, 'orders.view')");
    expect(sql).toContain("target_partner_visible");
    expect(sql).toMatch(/revoke all on table[\s\S]*from anon, authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/i);
  });

  it("keeps synchronization writes server-only and batches lines atomically", () => {
    expect(sql).toContain("upsert_partner_order_history_batch");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toMatch(/revoke all on function public\.upsert_partner_order_history_batch[\s\S]*authenticated/);
    expect(sql).toMatch(/grant execute on function public\.upsert_partner_order_history_batch[\s\S]*to service_role/);
  });

  it("creates one deterministic event per proven transition", () => {
    expect(sql).toContain("fingerprint text not null unique");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
    expect(sql).toContain("'state_changed'");
    expect(sql).toContain("'marked_for_deletion'");
    expect(sql).toContain("internal_only");
  });
});
