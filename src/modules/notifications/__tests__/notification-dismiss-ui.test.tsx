import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dismiss: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions/notification.actions", () => ({
  dismissNotificationAction: mocks.dismiss,
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock("../../behavior-analytics/components", () => ({ recordBehaviorInteraction: vi.fn() }));

import { PartnerLocaleProvider } from "../../partner-locale";
import { NotificationActions, NotificationItemShell } from "../components";

describe("notification dismiss UI", () => {
  it("removes the successful item immediately and does not render a false error", async () => {
    mocks.dismiss.mockResolvedValue({ success: true, data: "2026-09-06T18:30:00.000Z" });
    const user = userEvent.setup();
    render(
      <PartnerLocaleProvider locale="ru">
        <ul><NotificationItemShell notificationId="notification-1"><span>Temporary notification</span><NotificationActions dismissible notificationId="notification-1" read /></NotificationItemShell></ul>
      </PartnerLocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Скрыть" }));
    await waitFor(() => expect(screen.queryByText("Temporary notification")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
