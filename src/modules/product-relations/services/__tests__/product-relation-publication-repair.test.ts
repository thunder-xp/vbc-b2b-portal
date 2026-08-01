import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260801192000_product_relation_publication_cardinality_repair.sql",
  ),
  "utf8",
);
const safeDeleteSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260801193000_product_relation_safe_snapshot_delete.sql",
  ),
  "utf8",
);
const auditDomainSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260801194000_product_relation_sync_audit_domain.sql",
  ),
  "utf8",
);

describe("product relation publication cardinality repair", () => {
  it("enqueues each distinct active company through the single-company function", () => {
    expect(sql).toContain("select distinct membership.company_id");
    expect(sql).toContain("where membership.status = 'active'");
    expect(sql).toContain("perform public.enqueue_partner_commercial_opportunity_company(");
    expect(sql).not.toMatch(/insert into public\.partner_commercial_opportunity_dirty_companies[\s\S]*select distinct/i);
  });

  it("retains service-role-only execution", () => {
    expect(sql).toContain("if auth.role() <> 'service_role'");
    expect(sql).toContain("revoke all on function public.enqueue_all_partner_commercial_opportunity_companies()");
    expect(sql).toContain("to service_role");
  });

  it("uses an atomic pg-safeupdate-compatible snapshot replacement", () => {
    expect(safeDeleteSql).toContain("pg_advisory_xact_lock");
    expect(safeDeleteSql).toContain("delete from public.product_relations where id is not null");
    expect(safeDeleteSql).not.toContain("delete from public.product_relations;");
    expect(safeDeleteSql).toContain("set row_security = off");
  });

  it("allows product relation runs in the existing manual-sync audit", () => {
    expect(auditDomainSql).toContain("internal_sync_action_audit_events_domain_check");
    expect(auditDomainSql).toContain("'product_relations'");
  });
});
