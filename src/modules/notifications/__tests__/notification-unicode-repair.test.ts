import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { presentPartnerNotification } from "../../partner-locale";

const migration = readFileSync(resolve("supabase/migrations/20260905164925_partner_storefront_ux_and_competitor_fixes.sql"), "utf8");
const notification = {
  id: "00000000-0000-4000-8000-000000000001",
  eventCode: "warehouse_arrival_completed",
  eventGroup: "commercial" as const,
  severity: "success" as const,
  mandatory: false,
  title: "Новое пополнение склада",
  message: "В витрину добавлены товары из последнего поступления.",
  actionLabel: "Посмотреть пополнение",
  actionUrl: "/cabinet/catalog/replenishment",
  occurredAt: "2026-09-05T10:00:00Z",
  readAt: null,
  dismissedAt: null,
  expiresAt: "2026-12-05T10:00:00Z",
  relativeTime: "",
};

describe("notification Unicode repair", () => {
  it("keeps already-correct Russian presentation untouched", () => {
    expect(presentPartnerNotification(notification, "ru")).toMatchObject({
      title: "Новое пополнение склада",
      message: "В витрину добавлены товары из последнего поступления.",
    });
  });

  it("renders Romanian diacritics from governed event copy", () => {
    const rendered = presentPartnerNotification(notification, "ro");
    expect(rendered.title).toBe("Reaprovizionarea a fost publicată");
    expect(rendered.message).toContain("disponibile în catalog");
    expect("ă â î ș ț").toBe("ă â î ș ț");
  });

  it("repairs only exact corrupted event templates and leaves correct rows unmatched", () => {
    expect(migration).toContain("convert_from(convert_to(warehouse_title, 'UTF8'), 'WIN1251')");
    expect(migration).toContain("notification.title = bad_warehouse_title");
    expect(migration).toContain("notification.message = bad_warehouse_message");
    expect(migration).toContain("notification.message like bad_installation_message_prefix || '%'");
    expect(migration).not.toContain("update public.partner_notifications notification\n  set title = warehouse_title\n  where");
  });
});
