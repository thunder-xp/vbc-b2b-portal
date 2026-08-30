import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(
  process.cwd(),
  "supabase/migrations/20260830154103_localize_order_confirmation_email.sql",
), "utf8").toLowerCase();

describe("localized order confirmation event migration", () => {
  it("builds a normalized v2 payload in one bounded identity read", () => {
    expect(migration).toContain("payload_version, payload");
    expect(migration).toContain("p_order.submission_key, 2, event_payload");
    expect(migration).toContain("p_order.payload_snapshot->>'notificationlocale'");
    expect(migration).toContain("left join public.user_profiles customer");
    expect(migration).toContain("left join public.user_profiles manager");
    expect(migration).toContain("companies.assigned_internal_manager_user_id");
    expect(migration).toContain("'customername', customer_name");
    expect(migration).toContain("'manager', case when manager_name is null");
  });

  it("does not mislabel requested shipment as confirmed", () => {
    expect(migration).toContain("p_read_back_result->>'confirmeddeliverydate'");
    expect(migration).not.toContain("'confirmeddeliverydate', p_order.requested_delivery_date");
  });

  it("uses template v2 without duplicating existing recipient delivery", () => {
    expect(migration).toContain("eligible.recipient || ':v2'");
    expect(migration).toContain("deliveries.notification_event_id = events.id");
    expect(migration).toContain("deliveries.channel = 'email'");
    expect(migration).toContain("deliveries.recipient = lower(btrim(auth_user.email))");
  });

  it("preserves the privileged function boundary", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role");
  });
});
