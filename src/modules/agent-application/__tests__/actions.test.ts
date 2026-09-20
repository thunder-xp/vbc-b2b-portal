import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  requireAdminPermission: vi.fn(),
  submit: vi.fn(),
  withdraw: vi.fn(),
  review: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/src/modules/access-control/actions/service-factory", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("@/src/modules/admin/services", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("../factory", () => ({
  createCommercialAgentApplicationService: () => ({
    submit: mocks.submit,
    withdraw: mocks.withdraw,
    review: mocks.review,
  }),
}));

import {
  reviewCommercialAgentApplicationAction,
  submitCommercialAgentApplicationAction,
} from "../actions";

const USER_ID = "11000000-0000-4000-8000-000000000001";
const ADMIN_ID = "11000000-0000-4000-8000-000000000002";
const APPLICATION_ID = "11000000-0000-4000-8000-000000000003";

describe("Commercial Agent application actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: USER_ID, email: "agent@example.com" });
    mocks.requireAdminPermission.mockResolvedValue({ userId: ADMIN_ID });
    mocks.submit.mockResolvedValue({ id: APPLICATION_ID, status: "SUBMITTED" });
    mocks.review.mockResolvedValue({ id: APPLICATION_ID, status: "APPROVED" });
  });

  it("derives applicant identity from the authenticated server session", async () => {
    const formData = new FormData();
    formData.set("applicantUserId", ADMIN_ID);
    formData.set("displayName", "Runtime Agent");
    formData.set("agentType", "INDIVIDUAL");

    const result = await submitCommercialAgentApplicationAction(
      { success: false, message: null, application: null },
      formData,
    );

    expect(result.success).toBe(true);
    expect(mocks.submit).toHaveBeenCalledWith(USER_ID, "agent@example.com", expect.objectContaining({
      displayName: "Runtime Agent",
      agentType: "INDIVIDUAL",
    }));
    expect(mocks.submit).not.toHaveBeenCalledWith(ADMIN_ID, expect.anything(), expect.anything());
  });

  it("uses the existing admin permission guard and its principal for review", async () => {
    const formData = new FormData();
    formData.set("applicationId", APPLICATION_ID);
    formData.set("action", "APPROVE");

    await reviewCommercialAgentApplicationAction(formData);

    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.agents.manage");
    expect(mocks.review).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      actorUserId: ADMIN_ID,
      action: "APPROVE",
      safeNote: null,
    });
  });

  it("rejects an unknown review transition before repository work", async () => {
    const formData = new FormData();
    formData.set("applicationId", APPLICATION_ID);
    formData.set("action", "ACTIVATE");

    await expect(reviewCommercialAgentApplicationAction(formData)).rejects.toThrow("Review action is invalid");
    expect(mocks.review).not.toHaveBeenCalled();
  });
});
