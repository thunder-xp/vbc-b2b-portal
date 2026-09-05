import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkAllNotificationsReadButton, NotificationBell } from "../components";
import { notificationCopy } from "../../partner-locale";

const markRead = vi.fn();
const markAllRead = vi.fn();
const refresh = vi.fn();
vi.mock("../actions/notification.actions", () => ({
  markNotificationReadAction: (...args: unknown[]) => markRead(...args),
  markAllNotificationsReadAction: (...args: unknown[]) => markAllRead(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../behavior-analytics/components", () => ({
  recordBehaviorInteraction: vi.fn(),
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

  it.each([0, 1, 5, 100])("keeps the trigger geometry independent of unread count %i", (unreadCount) => {
    render(<NotificationBell initialSummary={{ ...summary, unreadCount }} />);
    const trigger = screen.getByRole("button", { name: new RegExp(`Уведомления: непрочитано ${unreadCount}`) });
    expect(trigger).toHaveClass("size-11", "shrink-0");
    if (unreadCount > 0) {
      const badge = trigger.querySelector("span");
      expect(badge).toHaveClass("absolute");
      expect(badge).toHaveTextContent(unreadCount > 99 ? "99+" : String(unreadCount));
    }
  });

  it("anchors the desktop popover below its trigger and bounds it to the viewport", () => {
    render(<NotificationBell initialSummary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /Уведомления/ }));
    expect(screen.getByRole("dialog")).toHaveClass(
      "sm:right-3",
      "lg:right-0",
      "lg:top-[calc(100%+0.5rem)]",
      "sm:max-w-[calc(100vw-1.5rem)]",
    );
  });

  it("updates the badge and popover immediately after mark-all succeeds", async () => {
    markAllRead.mockResolvedValueOnce({
      success: true,
      data: {
        affectedCount: 1,
        unreadCount: 0,
        correlationId: "00000000-0000-4000-8000-000000000099",
        markedAt: "2026-07-30T11:00:00Z",
      },
    });
    render(<><NotificationBell initialSummary={summary} /><MarkAllNotificationsReadButton disabled={false} /></>);

    fireEvent.click(screen.getByRole("button", { name: "Прочитать все" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: `${notificationCopy("ru").title}: ${notificationCopy("ru").unreadCount} 0` })).toBeInTheDocument();
    expect(screen.queryByText("1", { selector: "span" })).not.toBeInTheDocument();
  });
});
