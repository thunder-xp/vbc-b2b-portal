import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listAgents: vi.fn(), countReviewQueue: vi.fn() }));

vi.mock("@/src/modules/admin", () => ({
  requireAdminPagePermission: vi.fn(async () => ({ permissions: ["admin.agents.view", "admin.agents.manage"] })),
}));
vi.mock("@/src/modules/agent-domain", () => ({
  createAgentDomainService: () => ({ listAgents: mocks.listAgents }),
  createCommercialAgentAction: vi.fn(),
}));
vi.mock("@/src/modules/agent-application", () => ({
  createCommercialAgentApplicationService: () => ({ countReviewQueue: mocks.countReviewQueue }),
}));

import AdminAgentsPage from "../page";

describe("Admin Commercial Agents landing", () => {
  it("keeps operational Agents separate and exposes the bounded application queue", async () => {
    mocks.listAgents.mockResolvedValue([]);
    mocks.countReviewQueue.mockResolvedValue(2);
    render(await AdminAgentsPage());
    expect(screen.getByText("Агентов пока нет.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Заявки на регистрацию · 2" })).toHaveAttribute("href", "/admin/agents/applications");
    expect(mocks.countReviewQueue).toHaveBeenCalledOnce();
  });
});
