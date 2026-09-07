import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const enumSql = readFileSync(resolve(
  "supabase/migrations/20260907161212_omnichannel_activation_governance_sandbox.sql",
), "utf8");
const schemaSql = readFileSync(resolve(
  "supabase/migrations/20260907161226_omnichannel_activation_governance_schema.sql",
), "utf8");

describe("omnichannel activation governance migration", () => {
  it("adds SANDBOX as a distinct durable mode without a new queue", () => {
    expect(enumSql).toContain("add value if not exists 'SANDBOX'");
    expect(schemaSql).toContain("channel_mode in ('LIVE', 'SANDBOX')");
    expect(schemaSql).toContain("notification_delivery_receipts_live_mode_check");
    expect(schemaSql).not.toContain("create table public.communication_queue");
  });

  it("uses durable idempotent reservations with deterministic transaction locks", () => {
    expect(schemaSql).toContain("notification_delivery_rate_limit_reservations");
    expect(schemaSql).toContain("notification_delivery_id uuid not null unique");
    expect(schemaSql).toContain("pg_advisory_xact_lock");
    expect(schemaSql).toContain("v_recipient_limit constant integer := 10");
    expect(schemaSql).toContain("v_company_limit constant integer := 100");
  });

  it("keeps governance tables and functions service-only", () => {
    expect(schemaSql).toContain("enable row level security");
    expect(schemaSql).toContain("from public, anon, authenticated, service_role");
    expect(schemaSql).toContain("Communication rate limit is service-only");
    expect(schemaSql).not.toMatch(/service_role_key|smtp_password|COMMUNICATION_SANDBOX_EMAIL_RECIPIENT=/i);
  });

  it("records suppression separately and never turns it into acceptance", () => {
    expect(schemaSql).toContain("next_state := 'SUPPRESSED'");
    expect(schemaSql).toContain("notification_delivery_suppressed");
    expect(schemaSql).toContain("if p_succeeded then\n    insert into public.notification_delivery_receipts");
    expect(schemaSql).toContain("channel_mode public.communication_channel_mode not null default 'LIVE'");
  });

  it("exposes bounded operator diagnostics without message bodies", () => {
    expect(schemaSql).toContain("'governanceCounts'");
    expect(schemaSql).toContain("'rateLimits'");
    expect(schemaSql).toContain("'preferenceResult'");
    expect(schemaSql).not.toContain("'renderedSnapshot', recent.rendered_snapshot");
  });
});
