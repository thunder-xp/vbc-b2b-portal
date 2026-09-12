import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  "supabase/migrations/20260912181133_omnichannel_moldcell_sms_provider_adapter.sql",
), "utf8");

describe("Moldcell SMS provider migration", () => {
  it("uses the existing durable delivery entities without a parallel queue", () => {
    expect(sql).toContain("notification_delivery_attempts");
    expect(sql).toContain("notification_delivery_receipts");
    expect(sql).toContain("complete_notification_deliveries");
    expect(sql).not.toMatch(/create table public\.(sms_queue|sms_deliveries|moldcell_deliveries)/i);
  });

  it("limits targeted claims to the exact SUPPORT sandbox contract", () => {
    expect(sql).toContain("create function public.claim_moldcell_sandbox_delivery");
    expect(sql).toContain("delivery.channel_mode = 'SANDBOX'");
    expect(sql).toContain("event.event_type = 'support.sms_sandbox_test'");
    expect(sql).toContain("event.communication_purpose = 'SUPPORT'");
    expect(sql).toContain("delivery.adapter_identity = 'moldcell'");
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
  });

  it("keeps rate policy private and starts with deliberately low sandbox limits", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("values ('moldcell', 'sms', 'SANDBOX', 1, 5)");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("exposes only permission-gated aggregate health and no secrets", () => {
    expect(sql).toContain("has_internal_permission('admin.integrations.view')");
    expect(sql).toContain("grant execute on function public.get_admin_moldcell_sms_health() to authenticated");
    expect(sql).not.toMatch(/moldcell_guid|relay_secret|provider_id\s*=/i);
  });
});
