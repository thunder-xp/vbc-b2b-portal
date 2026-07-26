import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/partner-requests",
}));
vi.mock("@/src/modules/auth/actions/auth.actions", () => ({
  signOutAction: vi.fn(),
}));

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
      items: [
        {
          label: "Заявки на доступ",
          href: "/admin/partner-requests",
          permission: "admin.access_requests.view",
        },
      ],
    },
  ],
  environment: "development" as const,
  commitSha: null,
  deploymentId: null,
};

describe("AdminShell", () => {
  it("renders identity, active navigation, breadcrumb, and environment", () => {
    render(<AdminShell context={context}>Content</AdminShell>);

    expect(screen.getAllByText("Панель администратора").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Заявки на доступ").length).toBeGreaterThan(0);
    expect(screen.getByText("Sales Manager")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Заявки на доступ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens and closes mobile navigation with Escape", () => {
    render(<AdminShell context={context}>Content</AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Открыть навигацию" }));
    expect(screen.getByTestId("admin-navigation-overlay")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("admin-navigation-overlay")).not.toBeInTheDocument();
  });
});
