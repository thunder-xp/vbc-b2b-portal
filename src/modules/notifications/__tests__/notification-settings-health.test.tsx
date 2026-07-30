import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationPreferences } from "../components";

vi.mock("../actions/notification.actions", () => ({
  setNotificationPreferenceAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../../behavior-analytics/components", () => ({
  recordBehaviorInteraction: vi.fn(),
}));

const preferences = [
  {
    eventGroup: "orders" as const,
    inAppEnabled: true,
    emailEnabled: false,
    deliveryMode: "immediate" as const,
  },
  {
    eventGroup: "shipments" as const,
    inAppEnabled: true,
    emailEnabled: false,
    deliveryMode: "immediate" as const,
  },
  {
    eventGroup: "company_access" as const,
    inAppEnabled: true,
    emailEnabled: false,
    deliveryMode: "immediate" as const,
  },
];

describe("notification preferences and health", () => {
  it("shows all groups with mandatory in-app and unavailable future delivery", () => {
    render(<NotificationPreferences preferences={preferences} />);
    expect(screen.getByText("Заказы")).toBeInTheDocument();
    expect(screen.getByText("Отгрузки")).toBeInTheDocument();
    expect(screen.getByText("Доступ сотрудников")).toBeInTheDocument();
    expect(screen.getAllByText("В приложении включено")).toHaveLength(3);
    expect(screen.getAllByText("Отправка по email будет доступна позже.")).toHaveLength(3);
    expect(screen.getAllByText("Ежедневная сводка будет доступна позже.")).toHaveLength(3);
  });

  it("keeps daily and off modes unavailable in this slice", () => {
    render(<NotificationPreferences preferences={preferences} />);
    expect(screen.getAllByRole("option", { name: "Ежедневная сводка" })[0]).toBeDisabled();
    expect(screen.getAllByRole("option", { name: "Выключено" })[0]).toBeDisabled();
  });

  it("guards admin health with the explicit integration permission", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "app/(admin)/admin/integrations/notifications/page.tsx"),
      "utf8",
    );
    expect(page).toContain('requireAdminPagePermission("admin.integrations.view")');
    expect(page).not.toMatch(/smtp|credential|authorization/i);
  });
});
