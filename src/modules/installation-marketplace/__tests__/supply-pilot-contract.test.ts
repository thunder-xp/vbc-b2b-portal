import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration=readFileSync(resolve("supabase/migrations/20260916173444_installation_marketplace_supply_pilot_ux_v1.sql"),"utf8");
const admin=readFileSync(resolve("src/modules/installation-marketplace/admin-supply-pilot.tsx"),"utf8");

describe("Installation Marketplace supply pilot contract",()=>{
  it("keeps invitation delivery bounded, explicit and without SMS",()=>{
    expect(migration).toContain("READY_TO_SEND");
    expect(migration).toContain("PARTNER_SUBMITTED");
    expect(migration).toContain("array['IN_APP','EMAIL']");
    expect(migration).not.toMatch(/['\"]SMS['\"]/);
    expect(admin).toContain("Отправить приглашение");
    expect(admin).toContain("Подготовить приглашение");
  });
  it("forces RLS and exposes bounded aggregate reads",()=>{
    expect(migration.match(/force row level security/gi)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("admin_get_installation_marketplace_supply_v1");
    expect(migration).toContain("least(greatest(coalesce(p_limit,25),1),50)");
    expect(migration).toContain("set search_path=''");
  });
  it("uses factual coverage thresholds without changing Ranking V2",()=>{
    expect(migration).toContain("min_active_installers");
    expect(migration).toContain("NOT_READY");
    expect(migration).not.toContain("installation-ranking-v2");
  });
});
