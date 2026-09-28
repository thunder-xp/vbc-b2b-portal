import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), countReviewQueue: vi.fn() }));

vi.mock("@/src/modules/admin", () => ({
  requireAdminPagePermission: vi.fn(async () => ({ permissions: ["admin.agents.view", "admin.agents.manage"] })),
}));
vi.mock("@/src/modules/agent-operations", () => ({
  createAgentOperationsService: () => ({ list: mocks.list }),
}));
vi.mock("@/src/modules/agent-application", () => ({
  createCommercialAgentApplicationService: () => ({ countReviewQueue: mocks.countReviewQueue }),
}));

import AdminAgentsPage from "../page";

describe("Admin Commercial Agents landing", () => {
  it("keeps operational Agents separate and exposes the bounded application queue", async () => {
    mocks.list.mockResolvedValue([]);
    mocks.countReviewQueue.mockResolvedValue(2);
    render(await AdminAgentsPage());
    expect(screen.getByText("По выбранным условиям агенты не найдены.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Заявки · 2" })).toHaveAttribute("href", "/admin/agents/applications");
    expect(screen.getByLabelText("Auth")).toBeInTheDocument();
    expect(mocks.countReviewQueue).toHaveBeenCalledOnce();
  });
});
