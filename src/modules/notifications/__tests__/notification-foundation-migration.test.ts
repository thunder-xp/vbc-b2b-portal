import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730130000_partner_notification_foundation.sql",
  ),
  "utf8",
);

describe("partner notification foundation migration", () => {
  it("keeps protected writes away from partner table grants", () => {
    expect(sql).toContain("revoke all on public.partner_notifications from public, anon, authenticated");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all)\s+on\s+public\.partner_notifications\s+to\s+authenticated/i,
    );
  });

  it("scopes recipient reads to auth user and active membership", () => {
    expect(sql).toContain("recipient_user_id = auth.uid()");
    expect(sql).toContain(
      "public.has_active_notification_membership(company_id, auth.uid())",
    );
  });

  it("rejects arbitrary action URLs and HTML content", () => {
    expect(sql).toContain("public.is_allowed_partner_notification_url(action_url)");
    expect(sql).toContain("title !~ '[<>]'");
    expect(sql).not.toContain("http://");
    expect(sql).not.toContain("https://");
  });

  it("enforces recipient deduplication and retention", () => {
    expect(sql).toContain("unique (recipient_user_id, deduplication_key)");
    expect(sql).toContain("occurred_at + interval '13 months'");
  });

  it("makes self preferences mandatory in-app and reserves delivery modes", () => {
    expect(sql).toContain("primary key (company_id, user_id, event_group)");
    expect(sql).toContain("in_app_enabled");
    expect(sql).toContain("delivery_mode in ('immediate', 'daily', 'off')");
    expect(sql).toContain("or not p_in_app_enabled");
  });
});
