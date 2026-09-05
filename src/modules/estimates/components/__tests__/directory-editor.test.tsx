import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFinalCustomerAction } from "../../actions";
import { FinalCustomerDialog } from "../FinalCustomerDialog";
import { PartnerNomenclatureWorkspace } from "../PartnerNomenclatureWorkspace";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions", () => ({
  archivePartnerNomenclatureAction: vi.fn(),
  createFinalCustomerAction: vi.fn(),
  createPartnerNomenclatureAction: vi.fn(),
  updateFinalCustomerAction: vi.fn(),
  updatePartnerNomenclatureAction: vi.fn(),
}));

describe("estimate directories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens nomenclature editing in a bounded dialog and protects shared identity", async () => {
    const user = userEvent.setup();
    render(<PartnerNomenclatureWorkspace records={[{
      curationStatus: "review_required", hasCover: false, coverScope: null,
      id: "item-1", itemType: "equipment", manufacturer: "AXIS", model: "M1", name: "Камера",
      category: "Видео", unit: "pcs", specification: "Описание", lastUsedAt: null,
      createdAt: "2026-08-09T10:00:00Z", version: 1,
    }]} />);

    await user.click(screen.getAllByRole("button", { name: "Изменить" })[0]);
    expect(screen.getByRole("dialog", { name: "Изменить позицию" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Тип" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Производитель / бренд" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Модель / код" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Убрать из библиотеки" })).toBeInTheDocument();
    expect(screen.getByText("JPG, PNG или WebP, до 2 МБ.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить фото" })).toBeInTheDocument();
  });

  it("creates a final customer from the same modal interaction language", async () => {
    const user = userEvent.setup();
    vi.mocked(createFinalCustomerAction).mockResolvedValue({ success: true, data: {
      id: "customer-1", companyId: "company-1", displayName: "Customer SRL", customerType: "company",
      fiscalCode: null, locality: null, industry: null, industryCode: null, primaryEmail: null, revision: 1, archivedAt: null,
      createdAt: "2026-08-09T10:00:00Z", updatedAt: "2026-08-09T10:00:00Z",
    }, message: "Заказчик создан.", errorCode: null });
    render(<FinalCustomerDialog />);

    await user.click(screen.getByRole("button", { name: "Добавить заказчика" }));
    expect(screen.getByRole("dialog", { name: "Новый заказчик" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Заказчик" }), "Customer SRL");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(createFinalCustomerAction).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Customer SRL", customerType: "company" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
