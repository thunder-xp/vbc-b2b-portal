import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260928220000_agent_admin_operations_1c_binding_v1.sql"), "utf8");

describe("Agent operations 1C binding migration", () => {
  it("keeps contract and project history with one current exact binding", () => {
    expect(sql).toContain("create table public.agent_1c_contract_bindings");
    expect(sql).toContain("create table public.agent_1c_project_bindings");
    expect(sql).toContain("where is_current");
    expect(sql).toContain("AGENT_CONTRACT_SUPERSEDED");
    expect(sql).toContain("AGENT_PROJECT_SUPERSEDED");
  });

  it("forces RLS, removes delete, and exposes only fixed-search-path RPCs", () => {
    expect(sql).toContain("alter table public.agent_1c_contract_bindings force row level security");
    expect(sql).toContain("alter table public.agent_1c_project_bindings force row level security");
    expect(sql).toContain("revoke all on table public.agent_1c_bindings from service_role");
    expect(sql).toContain("grant select, insert, update on table public.agent_1c_bindings to service_role");
    expect(sql).not.toMatch(/grant\s+delete[^;]+agent_1c_(?:contract|project)_bindings/i);
    expect((sql.match(/security definer\nset search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("blocks Counterparty correction after downstream evidence and never mutates 1C", () => {
    expect(sql).toContain("exists (select 1 from public.agent_sale_links where agent_id = p_agent_id)");
    expect(sql).toContain("reconciliation is required");
    expect(sql).not.toMatch(/http|net\.http|Catalog_/i);
  });

  it("audits password recovery without storing secrets", () => {
    expect(sql).toContain("AUTH_PASSWORD_RESET_REQUESTED");
    expect(sql).toContain("EMAIL_RECOVERY");
    expect(sql).not.toMatch(/password\s+text|token\s+text|recovery_link/i);
  });
});
