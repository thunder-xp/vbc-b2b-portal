import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runDaily: vi.fn(), getState: vi.fn(), getPriceState: vi.fn(), prices: vi.fn(), stock: vi.fn() }));
vi.mock("../../actions", () => ({ runDailyCatalogSyncAction: mocks.runDaily, getDailyCatalogSyncStateAction: mocks.getState, getPriceSyncStateAction: mocks.getPriceState, syncPricesFromOneCAction: mocks.prices, syncStockFromOneCAction: mocks.stock }));
import { CatalogSyncPanel } from "../CatalogSyncPanel";

const state = { status: "never_run", rootName: null, lastSuccessfulSyncAt: null, durationMs: null, pagesProcessed: 0, foldersReceived: 0, productsReceived: 0, foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0, errorCategory: null, failedStage: null, nextScheduledRun: "2026-07-13T02:00:00.000Z" };
describe("CatalogSyncPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getState.mockResolvedValue({ success: true, data: state }); mocks.getPriceState.mockResolvedValue({ success: false }); mocks.runDaily.mockResolvedValue({ success: true, message: "done", data: state }); mocks.prices.mockResolvedValue({ success: false }); mocks.stock.mockResolvedValue({ success: false }); });
  it("renders three independent pipelines without the legacy summary", async () => {
    render(<CatalogSyncPanel />);
    expect(await screen.findByText("Catalog structure and products")).toBeInTheDocument();
    expect(screen.getByText("Partner prices")).toBeInTheDocument();
    expect(screen.getByText("Inventory and stock")).toBeInTheDocument();
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
  });
  it("uses the daily action for run and retry", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Run full catalog sync" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry failed catalog sync" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Retry failed catalog sync" }));
    expect(mocks.runDaily).toHaveBeenCalledTimes(2);
  });
  it("runs price and stock through separate actions", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Run price sync now" }));
    await user.click(screen.getByRole("button", { name: "Run stock sync now" }));
    expect(mocks.prices).toHaveBeenCalledOnce(); expect(mocks.stock).toHaveBeenCalledOnce(); expect(mocks.runDaily).not.toHaveBeenCalled();
  });
  it("shows a stalled queued continuation from persisted state", async () => {
    mocks.getPriceState.mockResolvedValue({ success: true, data: { status: "queued", updatedAt: "2020-01-01T00:00:00.000Z", currentStage: "price_type_scan", startedAt: "2020-01-01T00:00:00.000Z", lastSuccessfulSyncAt: null, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, failedStage: null, safeError: null, errorCategory: null } });
    render(<CatalogSyncPanel />);
    expect(await screen.findByText("Continuation has not started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry failed price sync" })).toBeEnabled();
  });
});
