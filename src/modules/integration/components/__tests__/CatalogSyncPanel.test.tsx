import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runDaily: vi.fn(), getState: vi.fn(), getPriceState: vi.fn(), getStockState:vi.fn(), prices: vi.fn(), stock: vi.fn(), rates: vi.fn(), all: vi.fn() }));
vi.mock("../../actions", () => ({ runDailyCatalogSyncAction: mocks.runDaily, getDailyCatalogSyncStateAction: mocks.getState, getPriceSyncStateAction: mocks.getPriceState,getStockSyncStateAction:mocks.getStockState, syncPricesFromOneCAction: mocks.prices, syncStockFromOneCAction: mocks.stock, syncExchangeRateFromOneCAction: mocks.rates, syncAllCommercialDataAction: mocks.all }));
import { CatalogSyncPanel } from "../CatalogSyncPanel";

const state = { status: "never_run", rootName: null, lastSuccessfulSyncAt: null, durationMs: null, pagesProcessed: 0, foldersReceived: 0, productsReceived: 0, foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0, errorCategory: null, failedStage: null, nextScheduledRun: "2026-07-13T02:00:00.000Z" };
describe("CatalogSyncPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getState.mockResolvedValue({ success: true, data: state }); mocks.getPriceState.mockResolvedValue({ success: false });mocks.getStockState.mockResolvedValue({success:false}); mocks.runDaily.mockResolvedValue({ success: true, message: "done", data: { state, projection } }); mocks.prices.mockResolvedValue({ success: false }); mocks.stock.mockResolvedValue({ success: false }); mocks.rates.mockResolvedValue({ success: false }); mocks.all.mockResolvedValue({ success: false }); });
  it("renders focused pipelines and the safe commercial sequence", async () => {
    render(<CatalogSyncPanel />);
    expect(await screen.findByText("Коммерческие данные")).toBeInTheDocument();
    expect(screen.getByText("Коммерческий курс 1С")).toBeInTheDocument();
    expect(await screen.findByText("Структура каталога и товары")).toBeInTheDocument();
    expect(screen.getByText("Партнёрские цены")).toBeInTheDocument();
    expect(screen.getByText("Остатки и наличие")).toBeInTheDocument();
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
  });
  it("uses the daily action for run and retry", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Запустить полную синхронизацию" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Повторить синхронизацию каталога" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Повторить синхронизацию каталога" }));
    expect(mocks.runDaily).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Published")).toBeInTheDocument();
  });
  it("runs price and stock through separate actions", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Синхронизировать цены" }));
    await user.click(screen.getByRole("button", { name: "Синхронизировать остатки" }));
    expect(mocks.prices).toHaveBeenCalledOnce(); expect(mocks.stock).toHaveBeenCalledOnce(); expect(mocks.runDaily).not.toHaveBeenCalled();
  });
  it("runs rate verification and the commercial sequence through server actions", async () => {
    const user = userEvent.setup(); render(<CatalogSyncPanel />);
    await user.click(screen.getByRole("button", { name: "Проверить курс сейчас" }));
    await user.click(screen.getByRole("button", { name: "Обновить коммерческие данные" }));
    expect(mocks.rates).toHaveBeenCalledOnce();
    expect(mocks.all).toHaveBeenCalledOnce();
  });
  it("shows a stalled queued continuation from persisted state", async () => {
    mocks.getPriceState.mockResolvedValue({ success: true, data: { status: "queued", updatedAt: "2020-01-01T00:00:00.000Z", currentStage: "price_type_scan", startedAt: "2020-01-01T00:00:00.000Z", lastSuccessfulSyncAt: null, pagesProcessed: 0, rowsScanned: 0, rowsStaged: 0, latestPricesResolved: 0, pricesPublished: 0, pricesDeactivated: 0, unmatchedProducts: 0, unknownPriceTypes: 0, scanComplete: false, failedStage: null, safeError: null, errorCategory: null } });
    render(<CatalogSyncPanel />);
    expect(await screen.findByText("Продолжение не запущено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить синхронизацию цен" })).toBeEnabled();
  });
});

const projection = { runId: "11111111-1111-4111-8111-111111111111", sourceDomain: "catalog", trigger: "manual", status: "succeeded", publicationId: "22222222-2222-4222-8222-222222222222", checksum: "a".repeat(64), durationMs: 25, safeErrorCode: null };
