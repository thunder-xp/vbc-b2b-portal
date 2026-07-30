import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BEHAVIOR_EVENT_NAMES } from "../../behavior-analytics/types";

const bell = read("src/modules/notifications/components/NotificationBell.tsx");
const page = read("app/(partner)/cabinet/notifications/page.tsx");
const analyticsMigration = read(
  "supabase/migrations/20260730133000_notification_behavior_events.sql",
);

describe("notification hardening", () => {
  it("governs all notification behavior events in application and database", () => {
    const events = [
      "notifications_opened",
      "notification_opened",
      "notification_marked_read",
      "notifications_marked_all_read",
      "notification_dismissed",
      "notification_preferences_updated",
    ] as const;
    for (const event of events) {
      expect(BEHAVIOR_EVENT_NAMES).toContain(event);
      expect(analyticsMigration).toContain(`'${event}'`);
    }
  });

  it("keeps analytics non-blocking", () => {
    const behavior = read(
      "src/modules/behavior-analytics/components/BehaviorViewEvent.tsx",
    );
    expect(behavior).toContain(".catch(() => undefined)");
  });

  it("uses named controls, visible severity, focus restoration, and 44px targets", () => {
    expect(bell).toContain("aria-label={`");
    expect(bell).toContain('event.key !== "Escape"');
    expect(bell).toContain("triggerRef.current?.focus()");
    expect(bell).toContain("h-11 w-11");
    expect(page).toContain("NotificationSeverityLabel");
    expect(page).toContain("min-h-11");
  });

  it("keeps mobile layouts bounded without horizontal page overflow", () => {
    expect(bell).toContain("fixed inset-x-3");
    expect(page).toContain("overflow-x-auto");
    expect(page).not.toContain("min-w-[");
  });
});

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
