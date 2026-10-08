import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalQuickCalculator } from "../ProposalQuickCalculator";
import { calculateQuickProposalAction, recordProposalGuidedProgressAction } from "../../actions/proposal-generator.actions";
vi.mock("../../actions/proposal-generator.actions", () => ({ calculateQuickProposalAction: vi.fn(), recordProposalGuidedProgressAction: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(recordProposalGuidedProgressAction).mockResolvedValue({ success: true, data: null, errorCode: null, message: "" }); });
describe("guided zone wizard", () => {
  it("supports all object cards and never calculates until explicit demand submission", async () => {
    const user = userEvent.setup(); render(<ProposalQuickCalculator currencyCode="MDL" onBack={vi.fn()} onCalculated={vi.fn()} />);
    for (const name of ["Квартира","Частный дом","Офис","Магазин / Retail","Склад","Промышленный объект","HoReCa","Другое"]) { const button = screen.getByRole("button", { name }); await user.click(button); expect(button).toHaveAttribute("aria-pressed", "true"); }
    expect(calculateQuickProposalAction).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Подобрать систему" })).toBeDisabled();
  });
  it("adds five house zones, edits placements and quantities, supports custom/removal and passes governed inputs", async () => {
    const user = userEvent.setup(); vi.mocked(calculateQuickProposalAction).mockResolvedValue({ success: false, message: "", errorCode: "invalid", data: null } as never);
    render(<ProposalQuickCalculator currencyCode="MDL" onBack={vi.fn()} onCalculated={vi.fn()} flowId="11111111-1111-4111-8111-111111111111" />);
    await user.click(screen.getByRole("button", { name: "Частный дом" })); await user.click(screen.getByRole("button", { name: "Продолжить" }));
    for (const name of ["Вход / выход","Периметр","Ворота / въезд","Парковка","Внутри"]) await user.click(screen.getByRole("button", { name }));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(5);
    const qty = screen.getByRole("spinbutton", { name: "Точек наблюдения: Внутри 5" }); await user.clear(qty); await user.type(qty,"3");
    await user.click(screen.getByText("Другие зоны")); await user.click(screen.getByRole("button", { name: "Другое" })); await user.type(screen.getByLabelText("Название зоны"), "Private zone");
    await user.click(screen.getByRole("button", { name: "Удалить зону: Другое 6" }));
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByText("Шаг 3 · Требования к системе")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Архив записи"), "60"); await user.click(screen.getByLabelText("Распознавание номеров"));
    await user.click(screen.getByRole("button", { name: "Подобрать систему" }));
    expect(calculateQuickProposalAction).toHaveBeenCalledTimes(1);
    const input = vi.mocked(calculateQuickProposalAction).mock.calls[0][0]; expect(input.guided?.zones).toHaveLength(5); expect(input.guided?.system).toMatchObject({ archiveDays: 60, recorderSelection: "auto", licensePlateRecognition: true, cableLength: 0 });
    expect(recordProposalGuidedProgressAction).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(recordProposalGuidedProgressAction).mock.calls)).not.toContain("Private zone");
  });
});
