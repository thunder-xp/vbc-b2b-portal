import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260814055148_govern_cctv_service_tariff_row_edits.sql"), "utf8");
const timestampRepairSql = readFileSync(resolve("supabase/migrations/20260814063137_align_cctv_tariff_publication_timestamp.sql"), "utf8");
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
});
