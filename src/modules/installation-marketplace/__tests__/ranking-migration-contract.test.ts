import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const sql=readFileSync(join(process.cwd(),"supabase/migrations/20260915202514_installation_marketplace_ranking_v2.sql"),"utf8").toLowerCase();
describe("Marketplace Ranking V2 migration contract",()=>{
  it("stores immutable versioned decisions and bounded deduplicated exposures behind forced RLS",()=>{
    for(const table of ["installation_ranking_decisions","installation_ranking_exposures"]){expect(sql).toContain(`create table public.${table}`);expect(sql).toContain(`alter table public.${table} force row level security`);}
    expect(sql).toContain("unique (project_id, provider_id, ranking_policy_version, impression_window)");
    expect(sql).toContain("prevent_installation_ranking_decision_mutation");
    expect(sql).toContain("prevent_installation_ranking_exposure_mutation");
  });
  it("keeps evidence/decision writes server-only and diagnostics admin-only",()=>{
    expect(sql).toContain("service_get_installation_ranking_evidence_v2");
    expect(sql).toContain("language plpgsql stable security definer set search_path = ''");
    expect(sql).toContain("grant execute on function public.service_get_installation_ranking_evidence_v2(uuid,uuid,text) to service_role");
    expect(sql).toContain("grant execute on function public.admin_get_installation_ranking_diagnostics_v2(uuid) to authenticated");
    expect(sql).toContain("has_internal_permission('admin.retail_marketplace.view')");
  });
  it("attributes selection to a server-derived decision and does not add payment, agent or 1C behavior",()=>{
    expect(sql).toContain("'rankingpolicyversion',ranking_policy_version");
    expect(sql).toContain("array_position(d.ordered_provider_ids,provider.id)");
    expect(sql).not.toMatch(/payment_attempt|agent_attribution|onec|send_sms/i);
  });
});
