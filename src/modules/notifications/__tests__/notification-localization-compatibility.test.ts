import { describe, expect, it } from "vitest";

import { presentPartnerNotification } from "../../partner-locale";
import type { PartnerNotification } from "../types";

const persisted: PartnerNotification = {
  id: "00000000-0000-4000-8000-000000000001",
  eventCode: "order_document_available",
  eventGroup: "documents",
  severity: "information",
  mandatory: false,
  title: "Доступен документ по заказу",
  message: "Сохранённый русский текст.",
  actionLabel: "Открыть документ",
  actionUrl: "/cabinet/documents/00000000-0000-4000-8000-000000000002",
  occurredAt: "2026-08-03T12:00:00Z",
  readAt: null,
  dismissedAt: null,
  expiresAt: "2026-11-03T12:00:00Z",
  relativeTime: "",
};

describe("legacy notification localization compatibility", () => {
  it("reconstructs governed Romanian presentation without changing identity or state", () => {
    expect(presentPartnerNotification(persisted, "ro")).toMatchObject({
      id: persisted.id,
      title: "Este disponibil un document al comenzii",
      actionUrl: persisted.actionUrl,
      readAt: null,
    });
  });

  it("preserves the immutable Russian presentation snapshot in Russian", () => {
    expect(presentPartnerNotification(persisted, "ru")).toMatchObject({
      title: persisted.title,
      message: persisted.message,
      actionUrl: persisted.actionUrl,
    });
  });
});
