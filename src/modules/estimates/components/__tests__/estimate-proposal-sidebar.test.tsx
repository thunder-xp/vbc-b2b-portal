import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEstimateVersionAction } from "../../actions/lifecycle.actions";
import type { EstimateWorkflowDto } from "../../types";
import { EstimateProposalSidebar } from "../EstimateProposalSidebar";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions/lifecycle.actions", () => ({ createEstimateVersionAction: vi.fn() }));

const workflow: EstimateWorkflowDto = {
  estimateId: "estimate-1",
  estimateStatus: "draft",
  lifecycleStatus: "draft",
  acceptedVersionId: null,
  emailDeliveryAvailable: false,
  guidedState: { state: "draft", primaryAction: null, secondaryActions: [], resumeCartId: null },
  permissions: { canManage: true, canSend: true, canConvert: true, canManageOrders: true },
  versions: [],
  readiness: { ready: true, checks: [{ label: "Есть позиции", passed: true }] },
};

describe("EstimateProposalSidebar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prepares an immutable proposal version through the existing action", async () => {
    const user = userEvent.setup();
    vi.mocked(createEstimateVersionAction).mockResolvedValue({ success: true, errorCode: null, message: "Версия создана.", data: { id: "version-1" } as never });
    render(<EstimateProposalSidebar revision={7} workflow={workflow} />);
    expect(screen.getByRole("heading", { name: "Коммерческое предложение" })).toBeInTheDocument();
    expect(screen.queryByText("Расчёт готов к подготовке предложения.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Подготовить КП" }));
    expect(createEstimateVersionAction).toHaveBeenCalledWith("estimate-1", 7, expect.stringMatching(/^[0-9a-f-]{36}$/), "");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("submits one logical command for a rapid double click", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    vi.mocked(createEstimateVersionAction).mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ success: true, errorCode: null, message: "Версия создана.", data: { id: "version-1" } as never });
    }));
    render(<EstimateProposalSidebar revision={7} workflow={workflow} />);
    const button = screen.getByRole("button", { name: "Подготовить КП" });
    await user.dblClick(button);
    expect(createEstimateVersionAction).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("refreshes once after a terminal version conflict without retrying", async () => {
    const user = userEvent.setup();
    vi.mocked(createEstimateVersionAction).mockResolvedValue({ success: false, errorCode: "ESTIMATE_VERSION_CONFLICT", message: "Смета изменилась.", data: null });
    render(<EstimateProposalSidebar revision={7} workflow={workflow} />);
    await user.click(screen.getByRole("button", { name: "Подготовить КП" }));
    expect(createEstimateVersionAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("blocks preparation while the editor has unsaved changes", () => {
    render(<EstimateProposalSidebar disabled revision={7} workflow={workflow} />);
    expect(screen.getByRole("button", { name: "Подготовить КП" })).toBeDisabled();
    expect(screen.getByText("Сохраните изменения перед подготовкой КП.")).toBeInTheDocument();
  });
});
