import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const sql=readFileSync(resolve("supabase/migrations/20260813191943_cctv_camera_candidate_pools.sql"),"utf8");
const governanceSql=readFileSync(resolve("supabase/migrations/20260814112114_govern_cctv_camera_pool_modes_and_ai_service.sql"),"utf8");
describe("CCTV camera pool migration",()=>{
  it("keeps governance private and immutable",()=>{expect(sql).toContain("enable row level security");expect(sql).toContain("prevent_cctv_camera_candidate_event_update_delete");expect(sql).toContain("admin.integrations.manage");});
  it("uses bounded local stock and sale signals without live 1C",()=>{expect(sql).toContain("product_stock_totals");expect(sql).toContain("warranty_serial_events");expect(sql).toContain("interval '90 days'");expect(sql).toContain("pg_try_advisory_xact_lock");expect(sql).not.toContain("http_");});
  it("uses one bounded admin search with no per-product lookup",()=>{expect(sql).toContain("create function public.search_cctv_camera_candidates");expect(sql).toContain("result_limit integer default 12");expect(sql).toContain("limit result_limit");expect(sql).toContain("already_in_pool boolean");});
  it("returns exact and explicit fallback candidates for shared compatibility filtering",()=>{expect(sql).toContain("pool.object_type in (target_object_type,'other')");expect(sql).not.toContain("not exists(select 1 from public.cctv_camera_candidate_pools exact_pool");});
  it("keeps pool governance internal and auditable",()=>{expect(sql).toContain("admin.integrations.manage");expect(sql).toContain("CCTV_CAMERA_POOL_CONFLICT");expect(sql).toContain("cctv_camera_candidate_pool_events");expect(sql).toContain("immutable");});
  it("stores both selection modes on one governed membership",()=>{expect(governanceSql).toContain("eligible_for_recommended boolean not null");expect(governanceSql).toContain("eligible_for_economy boolean not null");expect(governanceSql).toContain("previous_snapshot");});
  it("exposes only governed priced public service options",()=>{expect(governanceSql).toContain("list_public_cctv_service_options");expect(governanceSql).toContain("tariff.customer_unit_price>0");expect(governanceSql).toContain("ai_scenario_programming");expect(governanceSql).toContain("to service_role");});
});
