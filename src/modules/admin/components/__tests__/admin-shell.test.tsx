import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/partner-requests",
}));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({
  signOutAction: vi.fn(),
}));

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";
import { AdminShell } from "../AdminShell";

const context = {
  userId: "user-1",
  displayName: "Sales Manager",
  roleCodes: ["novotech_sales"],
  permissions: ["admin.access_requests.view"],
  isPlatformAdmin: false,
  navigation: [
    {
      label: "Партнёры",
      tier: "primary" as const,
      items: [
        {
          label: "Заявки на доступ",
          href: "/admin/partner-requests",
          permission: "admin.access_requests.view",
        },
      ],
    },
    {
      label: "Диагностика",
      tier: "secondary" as const,
      items: [
        {
          label: "История заданий",
          href: "/admin/integrations/jobs",
          permission: "admin.integrations.view",
        },
      ],
    },
  ],
  environment: "development" as const,
  commitSha: null,
  deploymentId: null,
};

const notificationCenter = {
  items: [], actionableCount: 0, waitingCount: 0, hasMore: false,
  generatedAt: "2026-09-26T12:00:00.000Z", sourceWarnings: [],
};

describe("AdminShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps navigation in the sidebar and header controls distinct", () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);

    expect(screen.getAllByText("Панель администратора").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Заявки на доступ").length).toBeGreaterThan(0);
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Заявки на доступ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Центр уведомлений: требуют внимания 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Профиль пользователя" })).toBeInTheDocument();

    const sidebar = screen.getByRole("navigation", {
      name: "Административная навигация",
    }).closest("aside");
    expect(sidebar).not.toBeNull();
    expect(within(sidebar!).queryByText("Sales Manager")).not.toBeInTheDocument();
    expect(within(sidebar!).queryByRole("button", { name: "Выйти" })).not.toBeInTheDocument();
  });

  it("opens the authenticated user menu and reuses the governed logout action", async () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);
    const trigger = screen.getByRole("button", { name: "Профиль пользователя" });

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Меню пользователя" });
    expect(menu).toHaveClass("fixed", "inset-x-3", "sm:absolute", "sm:right-0");
    expect(within(menu).getByText("Sales Manager")).toBeInTheDocument();
    expect(within(menu).getByText("novotech_sales")).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Профиль/ })).not.toBeInTheDocument();
    expect(within(menu).queryByText("Development")).not.toBeInTheDocument();

    const signOut = within(menu).getByRole("menuitem", { name: "Выйти" });
    fireEvent.submit(signOut.closest("form")!);
    await waitFor(() => expect(signOutAction).toHaveBeenCalledTimes(1));
  });

  it("closes the user menu with Escape and restores trigger focus", () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);
    const trigger = screen.getByRole("button", { name: "Профиль пользователя" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Меню пользователя" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens and closes mobile navigation with Escape", () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Открыть навигацию" }));
    expect(screen.getByTestId("admin-navigation-overlay")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("admin-navigation-overlay")).not.toBeInTheDocument();
  });

  it("keeps specialized destinations in one progressive disclosure group", () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);

    const disclosure = screen.getByText("Система и ещё").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Система и ещё"));
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "История заданий" })).toHaveAttribute(
      "href",
      "/admin/integrations/jobs",
    );
  });

  it("opens the Admin Notification Center from the header bell", () => {
    render(<AdminShell context={context} notificationCenter={notificationCenter}>Content</AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Центр уведомлений: требуют внимания 0" }));
    expect(screen.getByRole("dialog", { name: "Центр уведомлений" })).toBeInTheDocument();
  });
});
