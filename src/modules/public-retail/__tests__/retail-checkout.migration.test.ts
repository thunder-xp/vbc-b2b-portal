import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260813044458_retail_checkout_locked_order.sql"), "utf8");

describe("Retail checkout migration", () => {
  it("creates a Retail-only immutable aggregate with no anonymous table access", () => {
    for (const table of ["retail_customers", "retail_orders", "retail_order_lines", "retail_order_events", "retail_order_access_tokens"]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("Retail order lines are immutable.");
    expect(sql).toContain("Retail order events are append-only.");
    expect(sql).toContain("Retail order commercial snapshot is immutable.");
    expect(sql).toMatch(/revoke all on public\.retail_customers[\s\S]+from public, anon, authenticated/);
  });

  it("locks and converts one cart atomically with current publication revalidation", () => {
    const createOrder = sql.slice(sql.indexOf("create or replace function public.create_public_retail_order"), sql.indexOf("create or replace function public.get_public_retail_order"));
    expect(createOrder).toContain("for update");
    expect(createOrder).toContain("public.retail_checkout_snapshot");
    expect(createOrder).toContain("snapshot->>'fingerprint' <> p_checkout_fingerprint");
    expect(createOrder).toContain("status = 'converted'");
    expect(createOrder).toContain("'awaiting_payment'");
    expect(createOrder).not.toMatch(/Document_|one_c|maib|payment_attempt/i);
  });

  it("uses unique submission/cart identities and hash-only token access", () => {
    expect(sql).toContain("source_cart_id uuid not null unique");
    expect(sql).toContain("submission_key uuid not null unique");
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).toContain("where token.token_hash = p_access_token_hash");
    expect(sql).not.toContain("lookup by phone");
  });

  it("enforces anonymous PII allowlists and bounded addresses inside the RPC", () => {
    expect(sql).toContain("jsonb_object_keys(p_customer)");
    expect(sql).toContain("jsonb_object_keys(p_delivery_address)");
    expect(sql).toContain("char_length(coalesce(p_delivery_address->>'instructions', '')) > 500");
    expect(sql).toContain("Installation address is not applicable.");
  });

  it("snapshots unpriced installation intent and governed calculator evidence", () => {
    expect(sql).toContain("installation_intent_snapshot");
    expect(sql).toContain("calculator_evidence_snapshot");
    expect(sql).toContain("calculator_version");
    expect(sql).toContain("work_scope");
  });
});
