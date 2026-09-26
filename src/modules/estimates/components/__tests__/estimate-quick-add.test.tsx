import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addEstimateProductsAction, searchEstimateProductsAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto, EstimateProductPickerDto } from "../../services";
import { EstimateQuickAdd } from "../EstimateQuickAdd";

vi.mock("../../actions/estimate.actions", () => ({ addEstimateProductsAction: vi.fn(), addEstimateServicesAction: vi.fn(), searchEstimateProductsAction: vi.fn() }));
const estimate = { id: "estimate-1", revision: 3, lines: [] } as unknown as EstimateDetailDto;
const results: EstimateProductPickerDto = { products: [
  { id: "p1", sku: "400691", name: "Camera", imageUrl: null, categoryName: null, brandName: null, partnerPrice: "$50", retailPrice: null, stock: "", stockStatus: "in_stock", availableQuantity: 8, expectedArrival: null },
  { id: "p2", sku: "400692", name: "Recorder", imageUrl: null, categoryName: null, brandName: null, partnerPrice: "$80", retailPrice: null, stock: "", stockStatus: "out_of_stock", expectedArrival: null },
], categories: [], brands: [] };
function setup(overrides = {}) {
  const onResult = vi.fn(); const onExternal = vi.fn();
  render(<EstimateQuickAdd estimate={estimate} services={[]} sectionId="section-1" serviceMode={false} disabled={false} onResult={onResult} onExternal={onExternal} onBatch={vi.fn()} {...overrides} />);
  return { user: userEvent.setup(), onResult, onExternal };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchEstimateProductsAction).mockResolvedValue({ success: true, data: results, message: "", errorCode: null });
  vi.mocked(addEstimateProductsAction).mockResolvedValue({ success: true, data: { ...estimate, revision: 4 }, message: "saved", errorCode: null });
});
describe("continuous estimate Quick Add", () => {
  it("filters quick service choices by governed work destination and fails unknown closed", async () => {
    const services = [
      { id: "s1", name: "Монтаж камеры", description: null, defaultUnit: "pcs", unitLabel: "шт.", defaultCost: null, defaultSellingPrice: 10, vatApplicable: true, category: "service", workSectionKey: "installation_works" as const },
      { id: "s2", name: "Пусконаладка", description: null, defaultUnit: "service", unitLabel: "услуга", defaultCost: null, defaultSellingPrice: 20, vatApplicable: true, category: "service", workSectionKey: "commissioning_works" as const },
      { id: "s3", name: "Не определено", description: null, defaultUnit: "service", unitLabel: "услуга", defaultCost: null, defaultSellingPrice: 5, vatApplicable: true, category: "service", workSectionKey: null },
    ];
    const { user } = setup({ services, serviceMode: true, serviceWorkSectionKey: "installation_works" });
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /Монтаж камеры/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Пусконаладка/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Не определено/ })).not.toBeInTheDocument();
  });
  it("debounces search, selects with arrows, confirms quantity once and restores search focus", async () => {
    const { user, onResult } = setup();
    await user.keyboard("/");
    const search = screen.getByRole("combobox");
    expect(search).toHaveFocus();
    await user.type(search, "cam");
    await screen.findByRole("option", { name: /Camera/ });
    expect(searchEstimateProductsAction).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowDown}{Enter}");
    const quantity = screen.getByRole("spinbutton", { name: "Добавить количество" });
    await waitFor(() => expect(quantity).toHaveFocus());
    expect(quantity).toHaveAttribute("step", "1");
    expect(addEstimateProductsAction).not.toHaveBeenCalled();
    await user.clear(quantity); await user.type(quantity, "3{Enter}");
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(addEstimateProductsAction).toHaveBeenCalledWith("estimate-1", 3, [{ productId: "p2", quantity: 3 }], expect.objectContaining({ targetSectionId: "section-1", mergeExisting: true, requestKey: expect.any(String) }));
    await waitFor(() => expect(search).toHaveFocus());
    expect(search).toHaveValue("");
  });
  it("flushes a dirty draft before insertion and uses the returned revision", async () => {
    const beforeInsert = vi.fn().mockResolvedValue({ ...estimate, revision: 4 });
    const { user } = setup({ beforeInsert });
    await user.type(screen.getByRole("combobox"), "cam");
    await screen.findByRole("option", { name: /Camera/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(addEstimateProductsAction).toHaveBeenCalled());
    expect(beforeInsert).toHaveBeenCalledOnce();
    expect(addEstimateProductsAction).toHaveBeenCalledWith("estimate-1", 4, expect.any(Array), expect.any(Object));
  });
  it("restores focus after enabled DOM commit even when animation frames run before the transition commits", async () => {
    const { user } = setup();
    const search = screen.getByRole("combobox");
    await user.type(search, "cam");
    await screen.findByRole("option", { name: /Camera/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveFocus());
    const earlyFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { callback(0); return 1; });
    try {
      await user.keyboard("{Enter}");
      await waitFor(() => expect(search).toBeEnabled());
      await waitFor(() => expect(search).toHaveFocus());
      expect(search).toHaveValue("");
    } finally { earlyFrame.mockRestore(); }
  });
  it("shows same-section repeat handling and Escape performs no write", async () => {
    const { user } = setup({ estimate: { ...estimate, lines: [{ productId: "p1", sectionId: "section-1" }] } });
    await user.type(screen.getByRole("combobox"), "cam");
    await screen.findByText("Уже в разделе · количество суммируется");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(addEstimateProductsAction).not.toHaveBeenCalled();
  });
  it("does not search with dirty inline edits or intercept ordinary text shortcuts", async () => {
    const { user } = setup({ disabled: true });
    await user.keyboard("/");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(searchEstimateProductsAction).not.toHaveBeenCalled();
  });
  it("keeps a stable idempotency key on retry without losing quantity", async () => {
    vi.mocked(addEstimateProductsAction).mockResolvedValueOnce({ success: false, data: null, message: "Retry", errorCode: "UNKNOWN" });
    const { user } = setup();
    await user.type(screen.getByRole("combobox"), "cam"); await screen.findByRole("option", { name: /Camera/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveFocus());
    await user.keyboard("{Enter}"); await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Добавить" }));
    await waitFor(() => expect(addEstimateProductsAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(addEstimateProductsAction).mock.calls[0][3]?.requestKey).toBe(vi.mocked(addEstimateProductsAction).mock.calls[1][3]?.requestKey);
  });
  it("exposes existing external nomenclature from an empty result", async () => {
    vi.mocked(searchEstimateProductsAction).mockResolvedValue({ success: true, data: { ...results, products: [] }, message: "", errorCode: null });
    const { user, onExternal } = setup();
    await user.type(screen.getByRole("combobox"), "nothing");
    await user.click(await screen.findByRole("button", { name: /Добавить внешнюю номенклатуру/ }));
    expect(onExternal).toHaveBeenCalledOnce();
    expect(addEstimateProductsAction).not.toHaveBeenCalled();
  });
});
