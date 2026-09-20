import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260920053245_final_customer_one_c_provisioning_contract_v1.sql"), "utf8");

describe("Final Customer 1C provisioning migration", () => {
  it("keeps the worker service-only and diagnostics permission-gated", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain("public.has_internal_permission('admin.integrations.view')");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("enforces both external-id and identity-side active mapping uniqueness", () => {
    expect(migration).toContain("customer_external_refs_identity_system_entity_active_idx");
    expect(migration).toContain("on conflict (system, entity_type, external_id) where status = 'ACTIVE'");
  });

  it("persists create-attempt evidence before retry reconciliation", () => {
    expect(migration).toContain("create_attempted_at");
    expect(migration).toContain("mark_customer_external_create_attempted_v1");
    expect(migration).not.toContain("CREATE_RESULT_UNKNOWN");
  });

  it("does not mutate customer account or purchase entitlement state", () => {
    expect(migration).not.toMatch(/update\s+public\.customer_accounts/i);
    expect(migration).not.toMatch(/update\s+public\.customer_account_purchase_entitlements/i);
  });
});
