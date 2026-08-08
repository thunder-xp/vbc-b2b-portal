import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260809005000_partner_final_customers.sql"), "utf8");
const repository = readFileSync(join(process.cwd(), "src/modules/estimates/repositories/supabase/estimate.supabase-repository.ts"), "utf8");
const createEstimateRpc = repository.slice(repository.indexOf('supabase.rpc("create_estimate_v3"'), repository.indexOf("if (error || !data)", repository.indexOf('supabase.rpc("create_estimate_v3"')));

describe("partner final customers migration", () => {
  it("keeps customer identities company scoped and old estimates compatible", () => {
    expect(sql).toContain("create table public.partner_final_customers");
    expect(sql).toContain("company_id uuid not null references public.partner_companies");
    expect(sql).toContain("add column final_customer_id uuid null");
    expect(sql).not.toContain("alter column final_customer_id set not null");
  });

  it("uses bounded indexed search without cross-company discovery", () => {
    expect(sql).toContain("partner_final_customers_company_name_idx");
    expect(sql).toContain("customer.company_id = target_company_id");
    expect(sql).toContain("least(greatest(coalesce(result_limit, 8), 1), 12)");
    expect(sql).toContain("lower(customer.display_name) like normalized_query || '%'");
  });

  it("keeps old RPCs and introduces atomic versioned estimate attachment", () => {
    expect(sql).toContain("create or replace function public.create_estimate_v3");
    expect(sql).toContain("create or replace function public.save_estimate_commercial_draft_v2");
    expect(sql).toContain("id = target_final_customer_id and company_id = target.company_id");
    expect(sql).not.toMatch(/drop function public\.(create_estimate_v2|save_estimate_commercial_draft)/);
    expect(sql).toContain("request_key uuid");
    expect(createEstimateRpc).toContain("request_key: input.requestKey");
    expect(createEstimateRpc).not.toContain("target_request_key: input.requestKey");
  });

  it("denies direct writes and preserves append-only audit", () => {
    expect(sql).toContain("revoke all on table public.partner_final_customers");
    expect(sql).toContain("prevent_partner_final_customer_event_mutation");
    expect(sql).toContain("security definer\nset search_path = public");
  });

  it("keeps immutable proposal snapshots self describing", () => {
    expect(sql).toContain("customer.display_name");
    expect(sql).toContain("estimate_attached");
  });
});
