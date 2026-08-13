import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260813170021_platform_concurrency_error_contract.sql",
  "utf8",
);
const architecture = readFileSync("docs/architecture/BACKEND_ARCHITECTURE.md", "utf8");

describe("platform concurrency error contract", () => {
  it("repairs interactive domains through an explicit allowlist", () => {
    for (const functionName of [
      "approve_partner_access_request_v3",
      "partner_transition_support_ticket",
      "perform_partner_service_action",
      "update_purchasing_list_items",
      "update_purchase_template",
      "transition_external_item_request",
      "update_partner_external_nomenclature",
      "update_estimate_draft",
      "create_public_retail_order",
    ]) {
      expect(migration).toContain(`'${functionName}'`);
    }
    expect(migration).toContain("replace(definition, '''40001''', '''PT409''')");
  });

  it("leaves genuine serialization and bounded worker lease failures unchanged", () => {
    const allowlist = migration.slice(
      migration.indexOf("interactive_functions constant"),
      migration.indexOf("];", migration.indexOf("interactive_functions constant")),
    );
    for (const functionName of [
      "create_estimate_version",
      "complete_partner_order_history_bootstrap",
      "complete_warranty_serial_sync_run",
      "publish_one_c_service_history_page",
      "publish_one_c_service_serial_enrichment",
      "publish_warranty_serial_sync_step",
    ]) {
      expect(allowlist).not.toContain(`'${functionName}'`);
    }
  });

  it("documents retry and idempotency boundaries", () => {
    expect(architecture).toContain("SQLSTATE `40001` is reserved");
    expect(architecture).toContain("Never automatically retry `PT409`");
    expect(architecture).toContain("must not duplicate notifications, events, or other side effects");
  });
});
