import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260713210000_reservation_requests_foundation.sql"), "utf8");

describe("reservation request migration", () => {
  it("creates the minimal request tables without mutable stock or ERP reservation truth", () => {
    expect(sql).toContain("create table public.reservation_requests");
    expect(sql).toContain("create table public.reservation_request_items");
    const tableSection = sql.slice(sql.indexOf("create table public.reservation_requests"), sql.indexOf("create unique index"));
    expect(tableSection).not.toMatch(/available_stock|nearest_arrival|warehouse|external_1c|erp_order|reservation_reference/i);
  });

  it("enables RLS, denies anonymous access, and scopes partner access by company", () => {
    expect(sql).toContain("alter table public.reservation_requests enable row level security");
    expect(sql).toContain("alter table public.reservation_request_items enable row level security");
    expect(sql).toContain("revoke all on table public.reservation_requests from anon, authenticated");
    expect(sql).toContain("public.can_manage_reservation_company(company_id)");
    expect(sql).not.toMatch(/grant\s+(insert|delete).*to authenticated/i);
  });

  it("blocks duplicate active requests and quantity escalation", () => {
    expect(sql).toContain("reservation_requests_active_revision_idx");
    expect(sql).toContain("requested_quantity > 0 and requested_quantity <= specification_quantity");
  });

  it("uses atomic guarded RPCs for every status transition", () => {
    expect(sql).toContain("create_reservation_request_from_specification");
    expect(sql).toContain("submit_reservation_request");
    expect(sql).toContain("start_reservation_request_review");
    expect(sql).toContain("decide_reservation_request");
    expect(sql.match(/for update;/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("requires approved source, internal permission, and rejection comment", () => {
    expect(sql).toContain("specification.status <> 'approved'");
    expect(sql).toContain("permission.code = 'reservations.review'");
    expect(sql).toContain("Rejection requires a comment");
  });

  it("copies snapshots without updating the approved specification", () => {
    expect(sql).toContain("item.product_name_snapshot");
    expect(sql).toContain("item.partner_unit_price_amount");
    expect(sql).not.toMatch(/update\s+public\.project_specifications/i);
  });
});
