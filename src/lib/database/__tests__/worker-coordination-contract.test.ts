import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getWorkerCoordinationResult } from "../../workers/coordination-result";

const sql = read("supabase/migrations/20260813180819_worker_coordination_conflict_contract.sql");
const warrantySql = read("supabase/migrations/20260806220000_warranty_serial_evidence.sql");
const bootstrapRepository = read("src/modules/orders/repositories/supabase/order-history-bootstrap.supabase-repository.ts");

describe("worker lease and cursor conflict contract", () => {
  it("removes application-generated 40001 from all five worker contracts", () => {
    expect(sql).not.toMatch(/errcode\s*=\s*'40001'/i);
    for (const name of [
      "complete_partner_order_history_bootstrap", "complete_warranty_serial_sync_run",
      "publish_one_c_service_history_page", "publish_one_c_service_serial_enrichment",
      "publish_warranty_serial_sync_step",
    ]) expect(sql).toContain(name);
  });

  it("distinguishes lease, cursor, replay, completion, source, and supersession outcomes", () => {
    for (const code of ["lease_lost", "stale_cursor", "replayed_page", "already_completed", "stale_source", "superseded", "run_not_found"])
      expect(sql).toMatch(new RegExp(`(?:'|\\\\')${code}(?:'|\\\\')`));
  });

  it("uses the structured bootstrap completion path while retaining a PT409 compatibility wrapper", () => {
    expect(sql).toContain("complete_partner_order_history_bootstrap_v2");
    expect(sql).toContain("errcode='PT409'");
    expect(bootstrapRepository).toContain('rpc("complete_partner_order_history_bootstrap_v2"');
  });

  it("keeps exact row locks and owner-token comparisons", () => {
    expect(sql).toContain("where id=p_bootstrap_id for update");
    expect(sql.match(/lock_token is distinct from p_lock_token/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps exact cursor CAS and never turns a stale cursor into a write", () => {
    expect(sql).toContain("run.current_skip<>p_skip");
    expect(warrantySql).toContain("p_skip<>(case when p_stage='return_scan' then run.return_skip else run.sale_skip end)");
  });

  it("keeps source-level replay detection and unique-table publication logic unchanged", () => {
    expect(sql).toContain("Warranty sync repeated a previously seen page");
    expect(sql).toContain("replayed_page");
  });

  it("keeps service-history v2 enrichment behind a successful header publication", () => {
    expect(sql).toContain("if result->>'status'='coordination_conflict' then return result; end if;");
    expect(sql).toContain("history.last_seen_run_id=p_run_id");
  });

  it("parses only stable worker outcomes", () => {
    expect(getWorkerCoordinationResult({ status: "coordination_conflict", code: "lease_lost", runId: "r" }))
      .toEqual({ status: "coordination_conflict", code: "lease_lost", runId: "r" });
    expect(getWorkerCoordinationResult({ status: "coordination_conflict", code: "invented" })).toBeNull();
    expect(getWorkerCoordinationResult({ status: "completed" })).toBeNull();
  });
});

function read(path: string) { return readFileSync(resolve(process.cwd(), path), "utf8"); }
