import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260814055148_govern_cctv_service_tariff_row_edits.sql"), "utf8");
const timestampRepairSql = readFileSync(resolve("supabase/migrations/20260814063137_align_cctv_tariff_publication_timestamp.sql"), "utf8");
const decouplingSql = readFileSync(resolve("supabase/migrations/20260814084538_decouple_cctv_service_tariffs_from_legacy_b2b.sql"), "utf8");
const objectConfigurationSql = readFileSync(resolve("supabase/migrations/20260813202551_cctv_object_service_bindings.sql"), "utf8");
const publicTariffSql = readFileSync(resolve("supabase/migrations/20260813055501_retail_installation_marketplace_foundation.sql"), "utf8");

describe("CCTV service tariff row governance migration", () => {
  it("versions and publishes a changed shared tariff without mutating published lines", () => {
    expect(sql).toContain("admin_save_cctv_service_configuration");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'draft'");
    expect(sql).toContain("set status='superseded'");
    expect(sql).toContain("set status='published'");
    expect(sql).toContain("from public.installation_tariffs line");
    expect(sql).not.toMatch(/update\s+public\.installation_tariffs\s+set/i);
  });

  it("keeps tariff and object-binding evidence separate and append-only", () => {
    expect(sql).toContain("'tariff_draft_created'");
    expect(sql).toContain("'tariff_superseded'");
    expect(sql).toContain("'tariff_published'");
    expect(sql).toContain("'previousPrice',current_price,'newPrice',target_unit_price");
    expect(sql).toContain("public.cctv_object_service_binding_events");
  });

  it("enforces permissions, valid states, and optimistic versions", () => {
    expect(sql).toContain("admin.retail_marketplace.manage");
    expect(sql).toContain("admin.integrations.manage");
    expect(sql).toContain("expected_binding_version");
    expect(sql).toContain("expected_tariff_version");
    expect(sql).toContain("CCTV_TARIFF_CONFLICT");
    expect(sql).toContain("CCTV_SERVICE_BINDING_CONFLICT");
    expect(sql).toContain("Enabled service requires an active tariff and B2B mapping.");
    expect(sql).toContain("Default service must be enabled.");
    expect(sql).toContain("from public,anon");
  });

  it("preserves one shared tariff source for B2B and B2C", () => {
    expect(objectConfigurationSql).toMatch(/resolve_cctv_object_services[\s\S]*installation_tariffs/);
    expect(objectConfigurationSql).toMatch(/resolve_generator_cctv_object_services[\s\S]*installation_tariffs/);
    expect(publicTariffSql).toMatch(/get_current_public_installation_tariffs[\s\S]*installation_tariffs/);
    expect(sql).toContain("return public.get_all_cctv_object_configurations()");
  });

  it("returns the newly published version within the saving transaction", () => {
    expect(timestampRepairSql).toContain("published_at_value timestamptz := now()");
    expect(timestampRepairSql).not.toContain("clock_timestamp()");
    expect(timestampRepairSql).toContain("return public.get_all_cctv_object_configurations()");
  });

  it("publishes and enables normalized services without a legacy B2B mapping", () => {
    expect(decouplingSql).toContain("create table public.cctv_estimate_service_adapters");
    expect(decouplingSql).toContain("if target_enabled and effective_price is null then");
    expect(decouplingSql).not.toContain("Enabled service requires an active tariff and B2B mapping.");
    expect(decouplingSql).toContain("Enabled service requires an active tariff.");
    expect(decouplingSql).toContain("Default service must be enabled.");
  });

  it("keeps one shared tariff while adapting normalized identities only at the Estimate boundary", () => {
    expect(decouplingSql).toContain("'estimateServiceId',adapter.estimate_service_id");
    expect(decouplingSql).toContain("line.service_type=chosen.tariff_service_type");
    expect(decouplingSql).toContain("default_cost,default_selling_price");
    expect(decouplingSql).toContain("definition.sort_order,true,null,null,true,'service'");
    expect(decouplingSql).not.toContain("customer_unit_price)\n      select");
  });

  it("keeps the adapter private and the governed tariff mutation permissioned", () => {
    expect(decouplingSql).toContain("alter table public.cctv_estimate_service_adapters enable row level security");
    expect(decouplingSql).toContain("revoke all on table public.cctv_estimate_service_adapters from public,anon,authenticated");
    expect(decouplingSql).toContain("admin.retail_marketplace.manage");
    expect(decouplingSql).toContain("admin.integrations.manage");
  });
});
