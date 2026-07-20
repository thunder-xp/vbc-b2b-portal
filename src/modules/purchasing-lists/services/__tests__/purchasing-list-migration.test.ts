import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260720040000_saved_purchasing_lists.sql"), "utf8");

describe("saved purchasing lists migration", () => {
  it("creates the focused portal-owned aggregate without current commercial truth", () => {
    expect(sql).toContain("create table public.purchasing_lists");
    expect(sql).toContain("create table public.purchasing_list_items");
    expect(sql).toContain("unique (list_id, product_id)");
    const tableStart = sql.indexOf("create table public.purchasing_list_items");
    const itemTable = sql.slice(tableStart, sql.indexOf(");", tableStart));
    expect(itemTable).not.toMatch(/current_price|available_stock|expected_arrival|reservation/i);
  });

  it("enforces active membership permissions and private creator isolation", () => {
    expect(sql).toContain("public.has_permission(target.company_id, 'purchasing_lists.view')");
    expect(sql).toContain("target.visibility = 'company' or target.created_by = auth.uid()");
    expect(sql).toContain("alter table public.purchasing_lists enable row level security");
    expect(sql).toContain("revoke all on table public.purchasing_lists");
    expect(sql).not.toMatch(/create policy[\s\S]{0,200}using\s*\(true\)/i);
  });

  it("loads the index through one paginated aggregate without line payloads", () => {
    const start = sql.indexOf("create or replace function public.list_purchasing_lists_page");
    const block = sql.slice(start, sql.indexOf("create or replace function public.create_purchasing_list", start));
    expect(block).toContain("count(item.id)::integer");
    expect(block).toContain("array_agg(item.product_id order by item.position)");
    expect(block).toContain("limit target_limit offset target_offset");
    expect(block).not.toContain("item.note");
  });

  it("allows reads but denies direct authenticated writes", () => {
    expect(sql).toContain("grant select on table public.purchasing_lists");
    expect(sql).not.toContain("grant insert on table public.purchasing_lists");
    expect(sql).not.toContain("grant update on table public.purchasing_lists");
    expect(sql).not.toContain("grant delete on table public.purchasing_lists");
  });

  it("uses one idempotent transactional cart mutation", () => {
    expect(sql).toContain("create or replace function public.merge_purchasing_list_into_cart");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql.match(/insert into public\.cart_items/g)).toHaveLength(1);
    expect(sql).toContain("on conflict (cart_id, product_id) do update");
    expect(sql).toContain("least(9999, sum(row.quantity)::integer)");
  });

  it("requires complete bounded reorder batches and makes archive retries no-ops", () => {
    expect(sql).toContain("item_count <> (select count(*) from public.purchasing_list_items item where item.list_id = target.id)");
    expect(sql).toContain("if (target.archived_at is not null) = target_archived then return target; end if;");
  });

  it("creates an estimate and product lines atomically without an order", () => {
    const start = sql.indexOf("create or replace function public.create_estimate_from_purchasing_list");
    const block = sql.slice(start);
    expect(block).toContain("insert into public.estimates");
    expect(block).toContain("insert into public.estimate_items");
    expect(block).not.toContain("insert into public.partner_orders");
  });

  it("records only meaningful aggregate events", () => {
    expect(sql).toContain("'created', 'duplicated', 'archived', 'restored', 'added_to_cart', 'estimate_created'");
    expect(sql).not.toContain("item_quantity_changed");
  });
});
