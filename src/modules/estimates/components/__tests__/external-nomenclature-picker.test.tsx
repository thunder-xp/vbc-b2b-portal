import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { addEstimateExternalLineAction, searchExternalNomenclatureAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto } from "../../services";
import { ExternalNomenclaturePicker } from "../ExternalNomenclaturePicker";

vi.mock("../../actions/estimate.actions", () => ({
  addEstimateExternalLineAction: vi.fn(),
  searchExternalNomenclatureAction: vi.fn(),
}));

const estimate = { id: "estimate-1", revision: 3 } as EstimateDetailDto;
const match = { id: "external-1", manufacturer: "Ajax", model: "Hub 2", name: "Security hub", category: "Alarm", unit: "pcs" as const, specification: null, exactIdentityMatch: true };

describe("ExternalNomenclaturePicker", () => {
  it("suggests a shared match and reuses it without exposing tenancy", async () => {
    const user = userEvent.setup();
    vi.mocked(searchExternalNomenclatureAction).mockResolvedValue({ success: true, data: [match], message: "Найдено", errorCode: null });
    vi.mocked(addEstimateExternalLineAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<ExternalNomenclaturePicker disabled={false} estimate={estimate} onResult={vi.fn()} />);

    await user.type(screen.getByLabelText("Производитель"), "Ajax");
    await user.type(screen.getByLabelText("Модель"), "Hub 2");
    await user.type(screen.getByLabelText("Название"), "Security hub");
    expect(await screen.findByText("Похожая позиция уже существует в системе. Выберите существующую позицию, чтобы не создавать дубликат.")).toBeInTheDocument();
    expect(screen.queryByText(/компания|создал/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Выбрать Ajax Hub 2" }));
    await user.type(screen.getByLabelText("Цена"), "100");
    await user.click(screen.getByRole("button", { name: "Добавить выбранную" }));
    await waitFor(() => expect(addEstimateExternalLineAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ existingExternalItemId: "external-1", forceCreateNew: false })));
  });

  it("requires an explicit force-create action when a likely duplicate exists", async () => {
    const user = userEvent.setup();
    vi.mocked(searchExternalNomenclatureAction).mockResolvedValue({ success: true, data: [match], message: "Найдено", errorCode: null });
    vi.mocked(addEstimateExternalLineAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<ExternalNomenclaturePicker disabled={false} estimate={estimate} onResult={vi.fn()} />);
    await user.type(screen.getByLabelText("Производитель"), "Ajax");
    await user.type(screen.getByLabelText("Модель"), "Hub 2");
    await user.type(screen.getByLabelText("Название"), "Security hub custom");
    expect(await screen.findByRole("button", { name: "Всё равно создать новую позицию" })).toBeEnabled();
    await user.type(screen.getByLabelText("Цена"), "120");
    await user.click(screen.getByRole("button", { name: "Всё равно создать новую позицию" }));
    await waitFor(() => expect(addEstimateExternalLineAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ existingExternalItemId: null, forceCreateNew: true })));
  });
});
