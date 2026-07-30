import { describe, expect, it } from "vitest";

import {
  PARTNER_NOTIFICATION_EVENT_CATALOG,
  PARTNER_NOTIFICATION_EVENT_CODES,
} from "../domain";

describe("partner notification event catalog", () => {
  it("governs every Slice 1-2 event and keeps shipped disabled", () => {
    expect(Object.keys(PARTNER_NOTIFICATION_EVENT_CATALOG)).toEqual(
      PARTNER_NOTIFICATION_EVENT_CODES,
    );
    expect(PARTNER_NOTIFICATION_EVENT_CODES).not.toContain("order_shipped");
  });

  it("marks required critical events mandatory", () => {
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.order_reconciliation_required)
      .toMatchObject({ severity: "critical", mandatory: true });
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.shipment_overdue)
      .toMatchObject({ severity: "critical", mandatory: true });
    expect(PARTNER_NOTIFICATION_EVENT_CATALOG.employee_suspended)
      .toMatchObject({ severity: "critical", mandatory: true });
  });
});
