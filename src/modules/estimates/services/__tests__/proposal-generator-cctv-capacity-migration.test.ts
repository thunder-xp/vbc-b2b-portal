import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260811230000_proposal_generator_cctv_capacity_rules.sql"), "utf8").toLowerCase();

describe("proposal generator CCTV capacity migration", () => {
  it("creates governed semantic profiles without inventing missing product mappings", () => {
    for (const key of ["cctv.nvr.4", "cctv.nvr.8", "cctv.nvr.32", "cctv.poe.4", "cctv.poe.8", "cctv.poe.24", "cctv.storage.2tb", "cctv.storage.4tb", "cctv.storage.6tb"]) {
      expect(sql).toContain(key);
    }
    expect(sql).not.toMatch(/'cctv\.nvr\.(4|8|32)'[^;]+catalog_product_id/);
  });

  it("keeps capability resolution bounded and company scoped", () => {
    expect(sql).toContain("target_profile_keys text[]");
    expect(sql).toContain("profile.profile_key=any");
    expect(sql).toContain("public.can_access_estimates(target_company_id,'estimates.manage')");
    expect(sql).not.toContain("live 1c");
  });

  it("records bounded correction facts without raw requirement text", () => {
    for (const field of ["auto_nvr_profile", "recorder_selection", "proposed_hdd_capacity_tb", "selected_hdd_capacity_tb", "auto_product_replacement_count", "poe_replaced", "poe_removed"]) expect(sql).toContain(field);
    expect(sql).not.toContain("requirement_text");
  });

  it("preserves idempotent estimate creation through the existing atomic RPC", () => {
    expect(sql).toContain("create_estimate_from_generator_v3");
    expect(sql).toContain("if existing_estimate_id is not null then return created_estimate_id");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path=public");
  });
});
