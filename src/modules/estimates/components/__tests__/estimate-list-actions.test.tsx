import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveEstimateAction, deleteArchivedEstimateAction } from "../../actions/estimate.actions";
import { duplicateEstimateAction } from "../../actions/lifecycle.actions";
import { EstimateListActions } from "../EstimateListActions";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions/estimate.actions", () => ({ archiveEstimateAction: vi.fn(), deleteArchivedEstimateAction: vi.fn() }));
vi.mock("../../actions/lifecycle.actions", () => ({ duplicateEstimateAction: vi.fn() }));

describe("EstimateListActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links directly to the latest ready PDF", () => {
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId="document-1" revision={3} />);
    expect(screen.getByRole("link", { name: "Открыть последний PDF" })).toHaveAttribute("href", "/api/estimates/documents/document-1");
  });

  it("duplicates and archives through the existing server actions", async () => {
    const user = userEvent.setup();
    vi.mocked(duplicateEstimateAction).mockResolvedValue({ success: true, data: { estimateId: "copy-1" }, message: "Копия создана", errorCode: null });
    vi.mocked(archiveEstimateAction).mockResolvedValue({ success: true, data: null, message: "Архивировано", errorCode: null });
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);

    await user.click(screen.getByRole("button", { name: "Дублировать" }));
    expect(duplicateEstimateAction).toHaveBeenCalledWith("estimate-1");
    expect(push).toHaveBeenCalledWith("/cabinet/estimates/copy-1");
    await user.click(screen.getByRole("button", { name: "Архивировать смету" }));
    expect(archiveEstimateAction).toHaveBeenCalledWith("estimate-1", 3);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("exposes governed deletion only for archived estimates", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteArchivedEstimateAction).mockResolvedValue({ success: true, data: null, message: "Удалено", errorCode: null });
    render(<EstimateListActions archived canDeleteArchived estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);
    expect(screen.queryByRole("button", { name: "Архивировать смету" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить смету" }));
    expect(screen.getByRole("dialog", { name: "Удалить архивную смету?" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Удалить смету" })[1]);
    expect(deleteArchivedEstimateAction).toHaveBeenCalledWith("estimate-1", 3, expect.any(String));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not expose deletion for active estimates", () => {
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);
    expect(screen.queryByRole("button", { name: "Удалить смету" })).not.toBeInTheDocument();
  });

  it("does not offer deletion when immutable commercial history protects an archived estimate", () => {
    render(<EstimateListActions archived canDeleteArchived={false} estimateId="estimate-1" latestPdfDocumentId={null} revision={3} />);
    expect(screen.queryByRole("button", { name: "Удалить смету" })).not.toBeInTheDocument();
  });
});
