import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20260712210000_supplier_arrival_publication.sql"),"utf8");
describe("supplier arrival publication migration",()=>{
  it("keeps staging private and RPC service-role-only",()=>{expect(sql).toContain("revoke all on public.supplier_arrival_balance_stage");expect(sql).toContain("to service_role");});
  it("prevents browser roles from executing staging and base publication functions",()=>{expect(sql).toContain("public.publish_exact_stock_snapshot_base(uuid)");expect(sql).toContain("public.stage_supplier_arrival_balance_rows(uuid, integer, jsonb)");expect(sql).toContain("from public, anon, authenticated");});
  it("defensively sums balances before positive filtering",()=>{expect(sql).toContain("sum(remaining_quantity)");expect(sql).toContain("having sum(remaining_quantity) > 0");});
  it("publishes only confirmed shipment documents",()=>{expect(sql).toContain("d.is_posted and not d.is_deleted and not d.is_closed");expect(sql).toContain("02166cc3-bf4b-11e9-a7fe-000c2988d323");expect(sql).toContain("d.date_placement = 'ВШапке'");});
  it("excludes overdue arrivals using the snapshot business date",()=>{expect(sql).toContain("d.expected_arrival_date >= v_snapshot_date");});
  it("wraps stock and supplier publication in one transaction",()=>{expect(sql).toContain("publish_exact_stock_snapshot_base(p_sync_id)");expect(sql).toContain("insert into public.product_supplier_arrivals");});
  it("publishes only the earliest date for each product characteristic",()=>{expect(sql).toContain("select min(candidate.expected_arrival_date)");expect(sql).toContain("candidate.external_characteristic_ref = grouped_by_date.external_characteristic_ref");});
});
