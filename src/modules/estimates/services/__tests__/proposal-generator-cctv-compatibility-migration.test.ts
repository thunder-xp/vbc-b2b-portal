import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260812110000_proposal_generator_cctv_compatibility.sql"), "utf8");

describe("CCTV compatibility migration", () => {
  it("stores normalized verified recorder facts with immutable provenance", () => {
    for (const field of ["max_drive_capacity_tb", "compatibility_verified", "compatibility_evidence_source", "compatibility_verified_at"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("estimate_generator_calculator_profile_compatibility_events");
    expect(sql).toContain("prevent_estimate_generator_compatibility_event_mutation");
    expect(sql).toContain("set search_path=public");
    expect(sql).toContain("revoke all on function public.prevent_estimate_generator_compatibility_event_mutation()");
  });

  it.each([
    ["cctv.nvr.4", "130146", 4, 4, 1, 8],
    ["cctv.nvr.8", "130236", 8, 8, 1, 20],
    ["cctv.nvr.16", "130251", 16, 0, 1, 20],
    ["cctv.nvr.32", "130263", 32, 0, 2, 16],
  ])("activates %s only with exact governed product %s", (profile, sku, channels, poe, bays, maxDrive) => {
    expect(sql).toContain(`('${profile}','${sku}'`);
    expect(sql).toContain(`,${channels},${poe},${bays},${maxDrive},`);
  });

  it("activates approved PoE and HDD mappings while keeping PoE32 and HDD12 unresolved", () => {
    for (const sku of ["500144", "500145", "500107", "500097", "800105", "800068", "800008", "800039"]) expect(sql).toContain(`'${sku}'`);
    expect(sql).toContain("where profile_key in ('cctv.poe.32','cctv.storage.1tb','cctv.storage.12tb')");
    expect(sql).not.toContain("'cctv.storage.12tb','800042'");
  });

  it("records bounded compatibility telemetry without raw requirement text", () => {
    for (const field of ["storage_incompatibility_detected", "insufficient_poe_warning", "automatic_recorder_profile", "compatible_configuration_found"]) expect(sql).toContain(field);
    expect(sql).toContain("record_estimate_generator_session_v5");
    expect(sql).not.toContain("raw_requirement");
  });
});
