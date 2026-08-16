import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const sql=readFileSync(resolve("supabase/migrations/20260813191943_cctv_camera_candidate_pools.sql"),"utf8");
const governanceSql=readFileSync(resolve("supabase/migrations/20260814112114_govern_cctv_camera_pool_modes_and_ai_service.sql"),"utf8");
const hybridCameraSql=readFileSync(resolve("supabase/migrations/20260816192520_backfill_cctv_camera_capability_400540.sql"),"utf8");
const attributeDerivationSql=readFileSync(resolve("supabase/migrations/20260816194611_derive_cctv_capabilities_from_attributes.sql"),"utf8");
const restoreSql=readFileSync(resolve("supabase/migrations/20260815095808_restore_archived_cctv_camera_candidates.sql"),"utf8");
describe("CCTV camera pool migration",()=>{
  it("keeps governance private and immutable",()=>{expect(sql).toContain("enable row level security");expect(sql).toContain("prevent_cctv_camera_candidate_event_update_delete");expect(sql).toContain("admin.integrations.manage");});
  it("uses bounded local stock and sale signals without live 1C",()=>{expect(sql).toContain("product_stock_totals");expect(sql).toContain("warranty_serial_events");expect(sql).toContain("interval '90 days'");expect(sql).toContain("pg_try_advisory_xact_lock");expect(sql).not.toContain("http_");});
  it("uses one bounded admin search with no per-product lookup",()=>{expect(sql).toContain("create function public.search_cctv_camera_candidates");expect(sql).toContain("result_limit integer default 12");expect(sql).toContain("limit result_limit");expect(sql).toContain("already_in_pool boolean");});
  it("returns exact and explicit fallback candidates for shared compatibility filtering",()=>{expect(sql).toContain("pool.object_type in (target_object_type,'other')");expect(sql).not.toContain("not exists(select 1 from public.cctv_camera_candidate_pools exact_pool");});
  it("keeps pool governance internal and auditable",()=>{expect(sql).toContain("admin.integrations.manage");expect(sql).toContain("CCTV_CAMERA_POOL_CONFLICT");expect(sql).toContain("cctv_camera_candidate_pool_events");expect(sql).toContain("immutable");});
  it("backfills the approved hybrid camera from authoritative attributes without creating pool membership",()=>{
    expect(hybridCameraSql).toContain("product.sku = '400540'");
    expect(hybridCameraSql).toContain("transport.display_value = 'TCP+WIFI (Гибридная)'");
    expect(hybridCameraSql).toContain("resolution.display_value::smallint");
    expect(hybridCameraSql).toContain("synchronized_catalog_attributes:400540_hybrid_transport");
    expect(hybridCameraSql).not.toContain("insert into public.cctv_camera_candidate_pools");
  });
  it("derives future network camera capability from governed attributes without SKU rules",()=>{
    expect(attributeDerivationSql).toContain("reconcile_cctv_camera_capabilities(p_product_ids uuid[])");
    expect(attributeDerivationSql).toContain("attribute.label = 'Разрешение-MPx'");
    expect(attributeDerivationSql).toContain("attribute.label = 'Передача-данных'");
    expect(attributeDerivationSql).toContain("attribute.label = 'Тип-объектива'");
    expect(attributeDerivationSql).toContain("attribute.label = 'Форм-фактор'");
    expect(attributeDerivationSql).toContain("'TCP-IP (Цифровая)'");
    expect(attributeDerivationSql).toContain("'TCP+WIFI (Гибридная)'");
    expect(attributeDerivationSql).toContain("'TCP+4G (Гибридная)'");
    expect(attributeDerivationSql).not.toContain("400540");
    expect(attributeDerivationSql).not.toContain("product.sku");
  });
  it("reconciles the bounded product batch inside transactional attribute publication",()=>{
    expect(attributeDerivationSql).toContain("perform public.reconcile_cctv_camera_capabilities(p_product_ids)");
    expect(attributeDerivationSql).toContain("product.id = any(p_product_ids)");
    expect(attributeDerivationSql).toContain("capability.product_id = any(p_product_ids)");
    expect(attributeDerivationSql).toContain("security invoker");
    expect(attributeDerivationSql).toContain("grant execute on function public.reconcile_cctv_camera_capabilities(uuid[])");
    expect(attributeDerivationSql).not.toMatch(/\bloop\b/i);
  });
  it("stores both selection modes on one governed membership",()=>{expect(governanceSql).toContain("eligible_for_recommended boolean not null");expect(governanceSql).toContain("eligible_for_economy boolean not null");expect(governanceSql).toContain("previous_snapshot");});
  it("distinguishes active and archived memberships for governed restore",()=>{
    expect(restoreSql).toContain("membership.id is not null and membership.archived_at is null");
    expect(restoreSql).toContain("existing_pool_version integer");
    expect(restoreSql).toContain("existing_pool_archived boolean");
    expect(restoreSql).toContain("grant execute on function public.search_cctv_camera_candidates(text,text,text,integer) to authenticated");
  });
  it("exposes only governed priced public service options",()=>{expect(governanceSql).toContain("list_public_cctv_service_options");expect(governanceSql).toContain("tariff.customer_unit_price>0");expect(governanceSql).toContain("ai_scenario_programming");expect(governanceSql).toContain("to service_role");});
});
