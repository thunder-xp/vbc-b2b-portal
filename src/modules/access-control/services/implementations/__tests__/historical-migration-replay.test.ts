import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(resolve(`supabase/migrations/${name}`), "utf8");
}

describe("historical migration replay", () => {
  it("uses the access request owner column available at each historical point", () => {
    const approval = migration("20260709183000_internal_partner_approval_console.sql");
    const canonical = migration("20260710070500_access_requests_user_profile_id_canonical.sql");

    expect(approval).toContain("using (user_id = auth.uid() and status = 'pending_review')");
    expect(approval).not.toContain("using (user_profile_id = auth.uid() and status = 'pending_review')");
    expect(canonical).toContain("add column if not exists user_profile_id uuid");
    expect(canonical).toContain("set user_profile_id = user_id");
    expect(canonical).toContain("drop column if exists user_id cascade");
  });

  it("keeps repair migrations replay-safe on an empty database", () => {
    expect(migration("20260713001500_stock_stage_rpc_repair.sql")).toContain(
      "create or replace function public.stage_stock_balance_rows",
    );
    expect(migration("20260811220000_partner_employee_acceptance_artifact_cleanup.sql")).toMatch(
      /if not exists[\s\S]+ISECURITY COMPANY S\.R\.L\.[\s\S]+then\s+-- Fresh databases[\s\S]+return;/,
    );
    expect(migration("20260812110000_proposal_generator_cctv_compatibility.sql")).toContain(
      "if not exists (select 1 from public.catalog_products) then",
    );
    expect(migration("20260813071055_publish_default_retail_installation_tariffs.sql")).toMatch(
      /if v_actor_id is null then[\s\S]+return;/,
    );
  });

  it("skips only the absent Exterior fixture while preserving ambiguity protection", () => {
    const sql = migration("20260823113000_supplier_price_governance_and_exterior_reclassification.sql");

    expect(sql).toContain("if repair_count=0 then return; end if;");
    expect(sql).toContain(
      "if repair_count<>1 then raise exception 'Exterior repair requires exactly one authoritative applied upload.'; end if;",
    );
  });

  it("retains tracked DDL needed by later nomenclature and CCTV migrations", () => {
    const nomenclatureLibrary = migration("20260809190000_partner_external_nomenclature_library.sql");

    expect(nomenclatureLibrary).toContain(
      "create table public.partner_external_nomenclature_library",
    );
    expect(nomenclatureLibrary).toContain(
      "create table public.partner_external_nomenclature_events",
    );
    expect(nomenclatureLibrary).not.toMatch(/^-- Applied from tracked migration[^\n]*;\s*$/);
    expect(migration("20260810100000_external_nomenclature_governance.sql")).toContain(
      "alter table public.partner_external_nomenclature_library",
    );
    expect(migration("20260814091424_decouple_cctv_service_tariffs_from_legacy_b2b.sql")).toContain(
      "lower(service.name) = lower(definition.label_ru)",
    );
  });
});
