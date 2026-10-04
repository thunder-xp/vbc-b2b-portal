import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignAdminActions } from "../CampaignAdminActions";

const refresh = vi.fn();
const push = vi.fn();
const reopen = vi.fn();
const removeArchived = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({
  archiveCampaignAction: vi.fn(),
  deleteArchivedCampaignAction: (...args: unknown[]) => removeArchived(...args),
  duplicateCampaignAction: vi.fn(),
  pauseCampaignAction: vi.fn(),
  publishCampaignAction: vi.fn(),
  reopenCampaignForEditAction: (...args: unknown[]) => reopen(...args),
  resumeCampaignAction: vi.fn(),
}));

describe("CampaignAdminActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reopen.mockResolvedValue({ success: true, message: "Открыто", data: { revision: 3 } });
    removeArchived.mockResolvedValue({ success: true, message: "Удалено", data: true });
  });

  it("shows a compact governed delete only for archived campaigns", () => {
    const { rerender } = render(<CampaignAdminActions campaignId="campaign-1" canEdit compact status="active" />);
    expect(screen.queryByRole("button", { name: "Удалить архивное предложение" })).not.toBeInTheDocument();
    rerender(<CampaignAdminActions campaignId="campaign-1" canEdit compact status="archived" />);
    expect(screen.getByRole("button", { name: "Удалить архивное предложение" })).toHaveClass("size-9");
  });

  it("renders compact stop, reopen, and resume controls for their governed states", () => {
    const { rerender } = render(<CampaignAdminActions campaignId="campaign-1" canEdit canPause compact status="active" />);
    expect(screen.getByRole("button", { name: "Остановить" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Возобновить без изменений" })).not.toBeInTheDocument();
    rerender(<CampaignAdminActions campaignId="campaign-1" canEdit canPause compact status="paused" />);
    expect(screen.getByRole("button", { name: "Открыть для редактирования" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Возобновить без изменений" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить архивное предложение" })).not.toBeInTheDocument();
  });

  it("reopens a paused campaign through the explicit lifecycle action", async () => {
    render(<CampaignAdminActions campaignId="campaign-1" canEdit compact status="paused" />);
    await userEvent.click(screen.getByRole("button", { name: "Открыть для редактирования" }));
    expect(reopen).toHaveBeenCalledWith("campaign-1", "Открыто администратором для редактирования");
    expect(push).toHaveBeenCalledWith("/admin/commercial/campaigns/campaign-1");
  });

  it("requires confirmation before tombstoning an archived campaign", async () => {
    const user = userEvent.setup();
    render(<CampaignAdminActions campaignId="campaign-1" canEdit compact status="archived" />);
    await user.click(screen.getByRole("button", { name: "Удалить архивное предложение" }));
    expect(screen.getByRole("dialog", { name: "Удалить архивное предложение?" })).toBeInTheDocument();
    expect(removeArchived).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(removeArchived).toHaveBeenCalledWith("campaign-1", "Удалено администратором из архива");
  });
});
