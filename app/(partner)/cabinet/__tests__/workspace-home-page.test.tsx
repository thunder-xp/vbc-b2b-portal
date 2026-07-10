import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceHomeAction: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/src/modules/partner-cabinet/actions", () => ({
  getWorkspaceHomeAction: mocks.getWorkspaceHomeAction,
}));

vi.mock("@/src/modules/partner-cabinet/actions/index", () => ({
  getWorkspaceHomeAction: mocks.getWorkspaceHomeAction,
}));

vi.mock("@/src/modules/partner-cabinet/actions/workspace-home.action", () => ({
  getWorkspaceHomeAction: mocks.getWorkspaceHomeAction,
}));

vi.mock("server-only", () => ({}));

import CabinetPage from "../page";

describe("Workspace home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Workspace loaded.",
      data: {
        greetingName: "Partner User",
        company: {
          id: "company-1",
          name: "Partner Company",
          status: "active",
          priceType: "PRICE-TYPE-1C",
          manager: "Novotech partner manager",
        },
        catalog: {
          totalProductsLabel: "24",
          brands: 5,
          categories: 8,
        },
        pricing: {
          isActive: true,
          priceType: "PRICE-TYPE-1C",
          lastUpdate: "Available from current read model",
        },
        inventory: {
          isSynchronized: true,
          lastSynchronization: "Jul 10, 2026, 8:00 AM",
        },
        activity: [
          {
            id: "catalog",
            label: "Catalog synchronized",
            description: "Catalog read model is available.",
            occurredAt: "2026-07-10T08:00:00.000Z",
          },
        ],
      },
    });
  });

  it("renders the daily partner workspace instead of an empty dashboard", async () => {
    render(await CabinetPage());

    expect(screen.getByText("Good morning, Partner User")).toBeInTheDocument();
    expect(screen.getAllByText("Partner Company").length).toBeGreaterThan(0);
    expect(screen.getByText("My Company")).toBeInTheDocument();
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.getByText("My Prices")).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("No recent orders")).toBeInTheDocument();
    expect(screen.getByText("No documents")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users", async () => {
    mocks.getWorkspaceHomeAction.mockResolvedValue({
      success: false,
      errorCode: "AUTH_REQUIRED",
      message: "Authentication is required.",
      data: null,
    });

    await expect(CabinetPage()).rejects.toThrow("NEXT_REDIRECT:/auth/sign-in");
  });
});
