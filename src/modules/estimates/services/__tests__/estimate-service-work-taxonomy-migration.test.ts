import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260914213000_estimate_service_work_taxonomy.sql"), "utf8");

describe("estimate service work taxonomy migration", () => {
  it("uses governed identifiers and leaves unsupported services fail closed", () => {
    expect(sql).toContain("estimate_work_section_key");
    expect(sql).toContain("cctv_service_definitions");
    expect(sql).toContain("estimate_generator_calculator_profiles");
    expect(sql).toContain("else null");
    expect(sql).not.toMatch(/service\.name\s*(?:=|like|ilike)/i);
  });
});
