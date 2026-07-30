import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationBell } from "../components";

const markRead = vi.fn();
vi.mock("../actions", () => ({
  markNotificationReadAction: (...args: unknown[]) => markRead(...args),
}));

const summary = {
  unreadCount: 1,
  items: [{
    id: "00000000-0000-4000-8000-000000000001",
    eventCode: "shipment_due_today",
    eventGroup: "shipments" as const,
    severity: "warning" as const,
    mandatory: true,
    title: "Отгрузка запланирована на сегодня",
    message: "Проверьте актуальный статус заказа.",
    actionLabel: "Открыть отгрузки",
    actionUrl: "/cabinet/planned-shipments",
    occurredAt: "2026-07-30T10:00:00Z",
    readAt: null,
    dismissedAt: null,
    expiresAt: "2026-08-30T10:00:00Z",
    relativeTime: "час назад",
  }],
};

describe("NotificationBell", () => {
  it("opens without marking notifications as read", () => {
    render(<NotificationBell initialSummary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /Уведомления/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
  });

  it("closes on outside click", () => {
    render(<NotificationBell initialSummary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /Уведомления/ }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores trigger focus", () => {
    render(<NotificationBell initialSummary={summary} />);
    const trigger = screen.getByRole("button", { name: /Уведомления/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows only the bounded latest summary supplied by the server", () => {
    render(<NotificationBell initialSummary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /Уведомления/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

