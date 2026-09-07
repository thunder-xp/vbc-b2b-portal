import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(resolve(
  "supabase/migrations/20260907125602_omnichannel_durable_delivery_core.sql",
), "utf8");
const schemaMigration = readFileSync(resolve(
  "supabase/migrations/20260907125612_omnichannel_durable_delivery_schema.sql",
), "utf8");

describe("omnichannel durable delivery migration", () => {
  it("evolves the proven queue without a parallel scheduler or worker", () => {
    expect(enumMigration).toContain("notification_channel add value if not exists 'in_app'");
    expect(schemaMigration).toContain("alter table public.notification_events");
    expect(schemaMigration).toContain("alter table public.notification_deliveries");
    expect(schemaMigration).not.toContain("drop table public.notification_");
    expect(schemaMigration).toContain("create or replace function public.claim_notification_deliveries");
  });

  it("makes mode, state, intent, delivery, attempt, and receipt identities durable", () => {
    expect(schemaMigration).toContain("create type public.communication_channel_mode");
    expect(schemaMigration).toContain("create type public.communication_delivery_state");
    expect(schemaMigration).toContain("notification_events_intent_identity_idx");
    expect(schemaMigration).toContain("notification_deliveries_durable_identity_idx");
    expect(schemaMigration).toContain("create table public.notification_delivery_attempts");
    expect(schemaMigration).toContain("create table public.notification_delivery_receipts");
    expect(schemaMigration).toContain("prevent_notification_delivery_receipt_mutation");
  });

  it("keeps DRY_RUN and DISABLED deliveries outside provider claims", () => {
    expect(schemaMigration).toContain("where deliveries.channel_mode = 'LIVE'");
    expect(schemaMigration).toContain("on public.notification_deliveries(delivery_identity, channel_mode)");
    expect(schemaMigration).toContain("delivery.channel_mode <> 'LIVE'");
    expect(schemaMigration).toContain("Finance reminder simulation is server-only");
    expect(schemaMigration).toContain("Communication recipient is not an active company member");
  });

  it("keeps raw durable evidence service-only and redacts financial recipients in diagnostics", () => {
    expect(schemaMigration).toContain("enable row level security");
    expect(schemaMigration).toContain("revoke all on table public.notification_delivery_attempts from public, anon, authenticated");
    expect(schemaMigration).toContain("revoke all on table public.notification_delivery_receipts from public, anon, authenticated");
    expect(schemaMigration).toContain("delivery.sensitivity = 'FINANCIAL_PRIVATE'");
    expect(schemaMigration).not.toContain("service_role_key");
  });

  it("persists Finance projections atomically through the shared intent boundary", () => {
    expect(schemaMigration).toContain("perform public.persist_communication_intent");
    expect(schemaMigration).toContain("'channelMode', projection.content_payload#>>'{communication,mode}'");
    expect(schemaMigration).toContain("'renderSnapshot', jsonb_build_object");
  });
});
