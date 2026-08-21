import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addEstimateExternalLineAction, searchExternalNomenclatureAction } from "../../actions/estimate.actions";
import type { EstimateDetailDto } from "../../services";
import { ExternalNomenclaturePicker } from "../ExternalNomenclaturePicker";

vi.mock("../../actions/estimate.actions", () => ({
  addEstimateExternalLineAction: vi.fn(),
  searchExternalNomenclatureAction: vi.fn(),
}));

const estimate = { id: "estimate-1", revision: 3 } as EstimateDetailDto;
const match = { id: "external-1", itemType: "equipment" as const, manufacturer: "Ajax", model: "Hub 2", name: "Security hub", category: "Alarm", unit: "pcs" as const, specification: null, curationStatus: "active" as const, hasCover: false, coverScope: null, exactIdentityMatch: true };

describe("ExternalNomenclaturePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("searches only the active company's library by default", async () => {
    const user = userEvent.setup();
    vi.mocked(searchExternalNomenclatureAction).mockResolvedValue({ success: true, data: [], message: "Найдено", errorCode: null });
    render(<ExternalNomenclaturePicker disabled={false} estimate={estimate} itemType="equipment" onResult={vi.fn()} targetSectionId="section-2" />);

    await user.type(screen.getByLabelText("Производитель"), "Ajax");
    await user.type(screen.getByLabelText("Модель"), "Hub 2");
    await waitFor(() => expect(searchExternalNomenclatureAction).toHaveBeenCalledWith(expect.objectContaining({ itemType: "equipment", query: "AjaxHub 2", scope: "own" })));
    expect(screen.getByText("Поиск в вашей номенклатуре")).toBeInTheDocument();
  });

  it("searches the anonymous shared library only after explicit expansion and adopts a selected identity", async () => {
    const user = userEvent.setup();
    vi.mocked(searchExternalNomenclatureAction).mockResolvedValue({ success: true, data: [match], message: "Найдено", errorCode: null });
    vi.mocked(addEstimateExternalLineAction).mockResolvedValue({ success: true, data: estimate, message: "Добавлено", errorCode: null });
    render(<ExternalNomenclaturePicker disabled={false} estimate={estimate} itemType="equipment" onResult={vi.fn()} targetSectionId="section-2" />);

    await user.type(screen.getByLabelText("Производитель"), "Ajax");
    await user.type(screen.getByLabelText("Модель"), "Hub 2");
    await user.click(screen.getByRole("button", { name: "Расширить поиск" }));
    await waitFor(() => expect(searchExternalNomenclatureAction).toHaveBeenCalledWith(expect.objectContaining({ itemType: "equipment", scope: "shared" })));
    expect(screen.getByText("Поиск в общей библиотеке без данных о партнёрах")).toBeInTheDocument();
    expect(screen.queryByText(/компания|создатель|партнёр использует/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Выбрать Ajax Hub 2 Security hub" }));
    await user.type(screen.getByLabelText("Цена"), "100");
    await user.click(screen.getByRole("button", { name: "Добавить выбранную" }));
    await waitFor(() => expect(addEstimateExternalLineAction).toHaveBeenCalledWith("estimate-1", expect.objectContaining({ existingExternalItemId: "external-1", forceCreateNew: false })));
  });

  it("uses a service-only form without irrelevant manufacturer and model fields", () => {
    render(<ExternalNomenclaturePicker disabled={false} estimate={estimate} itemType="service" onResult={vi.fn()} targetSectionId="section-4" />);
    expect(screen.queryByLabelText("Производитель")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Модель")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Наименование")).toBeInTheDocument();
  });
});
