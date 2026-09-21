import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  confirmContract: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/src/modules/admin/services", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("../factory", () => ({
  createAgentDomainService: () => ({
    confirmCommercialAgentContract: mocks.confirmContract,
  }),
}));

import { confirmCommercialAgentContractAction } from "../actions";

const AGENT_ID = "11000000-0000-4000-8000-000000000001";
const ADMIN_ID = "11000000-0000-4000-8000-000000000002";

describe("Commercial Agent contract actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({ userId: ADMIN_ID });
  });

  it("requires Agent management permission and derives the confirming actor from the server session", async () => {
    const formData = new FormData();
    formData.set("agentId", AGENT_ID);

    await confirmCommercialAgentContractAction(formData);

    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.agents.manage");
    expect(mocks.confirmContract).toHaveBeenCalledWith(AGENT_ID, ADMIN_ID);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/agents/${AGENT_ID}`);
  });
});
