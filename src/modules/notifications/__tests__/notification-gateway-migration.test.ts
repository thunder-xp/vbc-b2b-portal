import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(
  process.cwd(),
  "supabase/migrations/20260827114152_notification_gateway_order_registered_email.sql",
), "utf8").toLowerCase();
const orderService = fs.readFileSync(path.join(
  process.cwd(),
  "src/modules/orders/services/order.service.ts",
), "utf8");
const invoiceProvider = fs.readFileSync(path.join(
  process.cwd(),
  "src/modules/integration/providers/one-c/one-c-document-provider.ts",
), "utf8");

describe("notification gateway migration", () => {
  it("creates a private channel-neutral outbox with recipient idempotency", () => {
    expect(migration).toContain("create table public.notification_events");
    expect(migration).toContain("create table public.notification_deliveries");
    expect(migration).toContain("'email', 'sms', 'telegram'");
    expect(migration).toContain("unique (notification_event_id, channel, recipient, template_version)");
    expect(migration).toContain("unique (event_type, partner_order_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.notification_events from public, anon, authenticated");
  });

  it("appends only at the verified order completion boundary", () => {
    const completion = migration.slice(migration.indexOf(
      "create or replace function public.complete_partner_order_submission_v3",
    ));
    expect(completion).toContain("read_back_verified = true");
    expect(completion).toContain("append_order_registered_in_1c_notification_event(");
    expect(completion).toContain("result, target_read_back_result");
    expect(migration).toContain("p_order.integration_status <> 'confirmed'");
    expect(migration).toContain("p_read_back_result->>'pricetyperef'");
    expect(migration).toContain("jsonb_typeof(p_read_back_result->'paymentamount') = 'number'");
    expect(migration).toContain("or (case");
    expect(migration).toContain("end) then");
  });

  it("claims bounded work with leases and caps delivery at three attempts", () => {
    expect(migration).toContain("for update of deliveries skip locked");
    expect(migration).toContain("limit normalized_batch_size");
    expect(migration).toContain("deliveries.attempt_count < 3");
    expect(migration).toContain("when 1 then interval '2 minutes'");
    expect(migration).toContain("else interval '15 minutes'");
    expect(migration).toContain("notification_delivery_dead_letter");
    expect(migration).toContain("create function public.complete_notification_deliveries(p_results jsonb)");
    expect(migration).toContain("jsonb_array_length(p_results) not between 1 and 50");
  });

  it("resolves only the active order creator with a confirmed email", () => {
    expect(migration).toContain("memberships.user_id = orders.submitted_by");
    expect(migration).toContain("memberships.status = 'active'");
    expect(migration).toContain("profiles.status = 'active'");
    expect(migration).toContain("auth_user.email_confirmed_at is not null");
    expect(migration).not.toContain("role_id in");
  });

  it("does not put provider I/O in the order service", () => {
    expect(orderService).not.toContain("nodemailer");
    expect(orderService).not.toContain("sendMail");
    expect(orderService).not.toContain("NotificationChannelAdapter");
  });

  it("keeps invoice attachment blocked until authoritative bytes are available", () => {
    expect(invoiceProvider).toContain('retrievalCapability: "metadata_only"');
    expect(invoiceProvider).toContain("1C document binary and print-form retrieval is not verified.");
  });

  it("protects admin diagnostics and retry independently", () => {
    expect(migration).toContain("has_internal_permission('admin.integrations.view')");
    expect(migration).toContain("has_internal_permission('admin.integrations.manage')");
    expect(migration).not.toContain("smtp_password");
  });
});
