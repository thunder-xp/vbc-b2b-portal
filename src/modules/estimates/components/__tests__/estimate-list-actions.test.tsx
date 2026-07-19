import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveEstimateAction } from "../../actions/estimate.actions";
import { duplicateEstimateAction } from "../../actions/lifecycle.actions";
import { EstimateListActions } from "../EstimateListActions";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../../actions/estimate.actions", () => ({ archiveEstimateAction: vi.fn() }));
vi.mock("../../actions/lifecycle.actions", () => ({ duplicateEstimateAction: vi.fn() }));

describe("EstimateListActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links directly to the latest ready PDF", () => {
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId="document-1" latestVersionId="version-1" revision={3} />);
    expect(screen.getByRole("link", { name: "Открыть последний PDF" })).toHaveAttribute("href", "/api/estimates/documents/document-1");
  });

  it("duplicates and archives through the existing server actions", async () => {
    const user = userEvent.setup();
    vi.mocked(duplicateEstimateAction).mockResolvedValue({ success: true, data: { estimateId: "copy-1" }, message: "Копия создана", errorCode: null });
    vi.mocked(archiveEstimateAction).mockResolvedValue({ success: true, data: null, message: "Архивировано", errorCode: null });
    render(<EstimateListActions archived={false} estimateId="estimate-1" latestPdfDocumentId={null} latestVersionId="version-1" revision={3} />);

    await user.click(screen.getByRole("button", { name: "Дублировать смету" }));
    expect(duplicateEstimateAction).toHaveBeenCalledWith("estimate-1");
    expect(push).toHaveBeenCalledWith("/cabinet/estimates/copy-1");
    await user.click(screen.getByRole("button", { name: "Архивировать смету" }));
    expect(archiveEstimateAction).toHaveBeenCalledWith("estimate-1", 3);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not expose archive for archived estimates", () => {
    render(<EstimateListActions archived estimateId="estimate-1" latestPdfDocumentId={null} latestVersionId={null} revision={3} />);
    expect(screen.queryByRole("button", { name: "Архивировать смету" })).not.toBeInTheDocument();
  });
});
