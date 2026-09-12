import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260912171617_sduc_dynamic_pricing_decrease_core.sql"),
  "utf8",
);

describe("SDUC migration contract", () => {
  it("ships price-neutral and without an invented ceiling", () => {
    expect(migration).toContain("1, false, 'DRY_RUN', null");
    expect(migration).toContain("'DECREASE', mechanism_type, false, 'DRY_RUN'");
    expect(migration).not.toContain("update public.product_prices");
    expect(migration).not.toContain("insert into public.product_prices");
  });

  it("uses the exact authoritative STOP identity", () => {
    expect(migration).toContain("5c72ff41-88d6-11e8-80dd-000c29a58b59");
    expect(migration).toContain("'UU-000004', 'STOP'");
  });

  it("keeps every SDUC table private, forced-RLS, and unavailable to browsers", () => {
    for (const table of [
      "sduc_system_policy",
      "sduc_mechanism_policies",
      "sduc_price_authorizations",
      "sduc_authorization_events",
      "sduc_calibration_state",
    ]) {
      expect(migration).toContain(`alter table private.${table} enable row level security`);
      expect(migration).toContain(`alter table private.${table} force row level security`);
      expect(migration).toContain(
        `revoke all on private.${table} from public, anon, authenticated, service_role`,
      );
    }
    expect(migration).toContain(
      "get_sduc_decrease_evaluation_context(uuid, uuid, text)\n  from public, anon, authenticated",
    );
  });

  it("fixes search_path and limits partner-visible diagnostics to aggregates", () => {
    expect(migration.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(8);
    const adminFunction = migration.slice(migration.indexOf("create function public.get_admin_sduc_readiness"));
    expect(adminFunction).not.toContain("'stopPrice'");
    expect(adminFunction).not.toContain("'reservePercent'");
    expect(adminFunction).not.toContain("global_decrease_ceiling_percent,");
    expect(adminFunction).toContain("has_internal_permission('admin.prices.view')");
  });

  it("provides idempotency, row locking, revalidation, and single-use order linkage", () => {
    expect(migration).toContain("unique (company_id, product_id, direction, mechanism_type, mechanism_instance_id)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update");
    expect(migration).toContain("revalidate_sduc_decrease_authorization");
    expect(migration).toContain("consumed_order_id uuid references public.partner_orders");
  });
});
