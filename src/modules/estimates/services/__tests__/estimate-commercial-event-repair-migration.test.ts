import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const commercialMigration = readFileSync(resolve("supabase/migrations/20260716140000_estimate_commercial_controls.sql"), "utf8");
const workflowMigration = readFileSync(resolve("supabase/migrations/20260716190000_estimate_versions_workflow.sql"), "utf8");
const repairMigration = readFileSync(resolve("supabase/migrations/20260809131000_estimate_commercial_event_type_repair.sql"), "utf8");
const wrapperRepairMigration = readFileSync(resolve("supabase/migrations/20260809132000_estimate_commercial_save_wrapper_repair.sql"), "utf8");

describe("estimate commercial event constraint repair", () => {
  it("repairs the workflow migration regression that removed commercial event types", () => {
    expect(commercialMigration).toContain("'commercial_updated'");
    expect(workflowMigration).not.toMatch(/estimate_events_type_check[\s\S]{0,500}'commercial_updated'/);
    expect(repairMigration).toContain("'commercial_updated'");
  });

  it("preserves both commercial and proposal workflow audit events", () => {
    for (const eventType of [
      "currency_changed", "section_created", "section_reordered", "line_moved",
      "discount_changed", "charge_added", "totals_recalculated", "ready",
      "version_created", "version_sent", "version_accepted", "version_rejected",
      "draft_restored", "duplicated", "template_created", "created_from_cart", "added_to_cart",
    ]) {
      expect(repairMigration).toContain(`'${eventType}'`);
    }
  });

  it("expands the implementation composite instead of casting it into the estimate UUID", () => {
    expect(wrapperRepairMigration).toContain("select * into result");
    expect(wrapperRepairMigration).toContain("from public.save_estimate_commercial_draft_impl(");
    expect(wrapperRepairMigration).not.toContain("select public.save_estimate_commercial_draft_impl(");
  });
});
