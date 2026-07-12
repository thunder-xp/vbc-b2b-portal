import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runDaily: vi.fn(), getState: vi.fn() }));
vi.mock("../../actions", () => ({ runDailyCatalogSyncAction: mocks.runDaily, getDailyCatalogSyncStateAction: mocks.getState }));
import { CatalogSyncPanel } from "../CatalogSyncPanel";

const state = { status: "never_run", rootName: null, lastSuccessfulSyncAt: null, durationMs: null, pagesProcessed: 0, foldersReceived: 0, productsReceived: 0, foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0, errorCategory: null, failedStage: null, nextScheduledRun: "2026-07-13T02:00:00.000Z" };
describe("CatalogSyncPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getState.mockResolvedValue({ success: true, data: state }); mocks.runDaily.mockResolvedValue({ success: true, message: "done", data: { ...state, status: "succeeded", rootName: "SECURITYPARK DISTRIBUTION" } }); });
  it("renders canonical state and no legacy provider or brand summary", async () => {
    render(<CatalogSyncPanel />);
    expect((await screen.findAllByText("SECURITYPARK DISTRIBUTION", { exact: false })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Brands")).not.toBeInTheDocument();
  });
  it("uses the daily action for Run and Retry", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Run full sync now" }));
    await user.click(screen.getByRole("button", { name: "Retry last failed sync" }));
    expect(mocks.runDaily).toHaveBeenCalledTimes(2);
  });
  it("blocks duplicate submission while a daily run is pending", async () => {
    let resolveRun!: (value: unknown) => void;
    mocks.runDaily.mockReturnValue(new Promise((resolve) => { resolveRun = resolve; }));
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    const runButton = screen.getByRole("button", { name: "Run full sync now" });
    await user.click(runButton);
    expect(screen.getByRole("button", { name: "Синхронизация..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry last failed sync" })).toBeDisabled();
    expect(mocks.runDaily).toHaveBeenCalledOnce();
    resolveRun({ success: true, message: "done", data: { ...state, status: "succeeded" } });
  });
});
