import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260915050629_final_customer_cabinet_value_v1.sql"), "utf8").toLowerCase();

describe("Final Customer Cabinet value migration", () => {
  it("creates only the bounded customer service intake and append-only audit", () => {
    expect(sql).toContain("create table public.customer_service_requests");
    expect(sql).toContain("create table public.customer_service_request_events");
    expect(sql).toContain("events are append-only");
    expect(sql).not.toContain("create table public.customer_purchases");
    expect(sql).not.toContain("create table public.customer_equipment");
  });

  it("forces RLS with own-account reads and no authenticated mutations", () => {
    expect(sql).toContain("alter table public.customer_service_requests force row level security");
    expect(sql).toContain("account.auth_user_id = (select auth.uid())");
    expect(sql).toContain("revoke all on public.customer_service_requests");
    expect(sql).toContain("grant select on public.customer_service_requests");
    expect(sql).not.toContain("grant insert on public.customer_service_requests");
    expect(sql).not.toContain("grant update on public.customer_service_requests");
  });

  it("uses bounded status and request-type contracts", () => {
    for (const value of ["installation_request", "diagnostics", "warranty_question", "product_question", "order_question", "other", "new", "in_review", "need_info", "accepted", "resolved", "closed", "cancelled"]) expect(sql).toContain(`'${value}'`);
  });

  it("adds no job, live 1C dependency, or notification side effect", () => {
    expect(sql).not.toContain("cron.schedule");
    expect(sql).not.toContain("http(");
    expect(sql).not.toContain("notification_deliver");
  });

  it("provides one bounded command-center aggregate", () => {
    expect(sql).toContain("get_final_customer_cabinet_overview_v1");
    expect(sql).toContain("limit 3");
    expect(sql).toContain("grant execute on function public.get_final_customer_cabinet_overview_v1(uuid) to service_role");
  });
});
