import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260908112208_partner_ux_corrections.sql",
), "utf8");

describe("partner UX corrections migration", () => {
  it("restores every governed notification route without widening to arbitrary URLs", () => {
    expect(sql).toContain("value = '/cabinet'");
    expect(sql).toContain("^/cabinet/documents/[0-9a-f-]{36}$");
    expect(sql).toContain("value = '/cabinet/finance'");
    expect(sql).not.toContain("value like '/cabinet/%'");
  });

  it("keeps existing notification data and asserts that every persisted URL is valid", () => {
    expect(sql).toContain("from public.partner_notifications notification");
    expect(sql).toContain("not public.is_allowed_partner_notification_url(notification.action_url)");
    expect(sql).not.toMatch(/delete\s+from\s+public\.partner_notifications/i);
    expect(sql).not.toMatch(/update\s+public\.partner_notifications/i);
  });

  it("pins the helper search path", () => {
    expect(sql).toContain("set search_path = ''");
  });
});
