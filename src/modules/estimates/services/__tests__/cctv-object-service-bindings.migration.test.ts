import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260813202551_cctv_object_service_bindings.sql"), "utf8");

describe("CCTV object service binding migration", () => {
  it("keeps tariff truth separate from normalized object bindings", () => {
    expect(sql).toContain("create table public.cctv_object_service_bindings");
    expect(sql).toContain("tariff_service_type text not null unique");
    expect(sql).not.toMatch(/cctv_object_service_bindings[\s\S]{0,500}customer_unit_price/);
  });

  it("protects private tables and privileged RPCs", () => {
    expect(sql).toContain("alter table public.cctv_object_service_bindings enable row level security");
    expect(sql).toContain("revoke all on public.cctv_service_definitions");
    expect(sql).toContain("has_internal_permission('admin.integrations.manage')");
    expect(sql).toContain("set search_path=public");
    expect(sql).toContain("CCTV_SERVICE_BINDING_CONFLICT");
  });

  it("provides one bounded runtime resolver and immutable audit events", () => {
    expect(sql).toContain("create function public.resolve_cctv_object_services");
    expect(sql).toContain("cardinality(target_service_types)>4");
    expect(sql).toContain("CCTV object service events are append-only");
    expect(sql).toContain("create function public.resolve_generator_cctv_object_services");
  });

  it("preserves baseline services without inventing class II/III prices", () => {
    expect(sql).toContain("definition.code in ('cable_routing_class_1','equipment_installation_class_1','commissioning','remote_viewing_configuration')");
    expect(sql).not.toMatch(/'cable_routing_class_2'[^\n]+,[^\n]+,[^\n]+,[^\n]+,[^\n]+,[^\n]+,[^\n]+,[^\n]+,[^\n]+\d+\.\d+/);
  });

  it("supports remote viewing as its own family and preserves commissioning per-camera units", () => {
    expect(sql).toContain("'commissioning','remote_viewing_configuration','ai_scenario_programming'");
    expect(sql).toContain("('commissioning','commissioning',null,'piece','commissioning'");
  });
});
