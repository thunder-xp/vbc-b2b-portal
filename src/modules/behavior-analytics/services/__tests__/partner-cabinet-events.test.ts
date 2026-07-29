import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BEHAVIOR_EVENT_NAMES } from "../../types";

const CABINET_EVENTS = [
  "dashboard_viewed",
  "dashboard_action_clicked",
  "order_list_viewed",
  "order_opened",
  "shipment_viewed",
  "date_change_started",
  "finance_viewed",
  "company_users_viewed",
] as const;
const ESTIMATE_EVENTS = [
  "estimates_viewed",
  "estimate_created",
  "estimate_product_added",
  "estimate_service_added",
  "estimate_price_check_started",
  "estimate_price_check_applied",
  "proposal_created",
  "proposal_version_created",
  "proposal_previewed",
  "proposal_pdf_generated",
  "proposal_sent",
  "proposal_send_failed",
  "proposal_converted_to_order",
] as const;

describe("partner cabinet behavior events", () => {
  it("keeps the application and database allowlists aligned", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260729090000_partner_cabinet_behavior_events.sql"),
      "utf8",
    );

    for (const eventName of CABINET_EVENTS) {
      expect(BEHAVIOR_EVENT_NAMES).toContain(eventName);
      expect(migration).toContain(`'${eventName}'`);
    }
    expect(migration).toContain("has_active_company_membership");
    expect(migration).toContain("has_permission");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("service_role");
  });

  it("keeps estimate workflow events aligned with the protected database allowlist", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260729110000_estimate_proposal_behavior_events.sql"),
      "utf8",
    );

    for (const eventName of ESTIMATE_EVENTS) {
      expect(BEHAVIOR_EVENT_NAMES).toContain(eventName);
      expect(migration).toContain(`'${eventName}'`);
    }
    expect(migration).toContain("has_active_company_membership");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("service_role");
  });

  it("records views through bounded cabinet surfaces without product identifiers", () => {
    const routes = [
      "app/(partner)/cabinet/page.tsx",
      "app/(partner)/cabinet/orders/page.tsx",
      "app/(partner)/cabinet/orders/[id]/page.tsx",
      "app/(partner)/cabinet/reservation-requests/page.tsx",
      "app/(partner)/cabinet/finance/page.tsx",
      "app/(partner)/cabinet/company/users/page.tsx",
    ];

    for (const route of routes) {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source).toContain("BehaviorViewEvent");
      expect(source).not.toContain("external1c");
    }
  });
});
