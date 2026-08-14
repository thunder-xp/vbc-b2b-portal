import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({
  updateAdminPublicPartnerDirectoryAction: vi.fn(),
}));

import { AdminPublicPartnerDirectory } from "../AdminPublicPartnerDirectory";

const page = {
  records: [{
    companyId: "32cdb925-2e0b-4541-967c-f22b7f06f376",
    companyName: "Canonical Company",
    publicDisplayName: null,
    currentLogoUrl: null,
    approvedLogoUrl: null,
    visible: false,
    revision: 1,
    updatedAt: null,
    publishedAt: null,
  }],
  totalCount: 1,
  publishedCount: 1,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  search: "",
  filter: "all" as const,
};

describe("admin public partner-directory UI", () => {
  it("shows compact governance fields, fallback preview, and no commercial data", () => {
    const { container } = render(<AdminPublicPartnerDirectory page={page} />);
    expect(screen.getByRole("heading", { name: "Публичный каталог партнёров" })).toBeInTheDocument();
    expect(screen.getByText("Canonical Company")).toBeInTheDocument();
    expect(screen.getByText("Логотип отсутствует: публичная карточка использует безопасную заглушку.")).toBeInTheDocument();
    expect(screen.getByLabelText("Показывать в каталоге партнёров")).not.toBeChecked();
    expect(container.innerHTML).not.toMatch(/debt|contract|external_1c|partnerPrice/i);
  });

  it("blocks an empty public name when visibility is enabled", () => {
    render(<AdminPublicPartnerDirectory page={page} />);
    fireEvent.click(screen.getByLabelText("Показывать в каталоге партнёров"));
    expect(screen.getByText("Для публикации укажите публичное название.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  it("uses the exact public card presentation for preview", () => {
    render(<AdminPublicPartnerDirectory page={page} />);
    fireEvent.change(screen.getByLabelText("Публичное название"), { target: { value: "Approved Public Name" } });
    expect(screen.getByRole("heading", { name: "Approved Public Name" })).toBeInTheDocument();
  });

  it("formats governance timestamps in a deterministic Novotech timezone", () => {
    render(<AdminPublicPartnerDirectory page={{
      ...page,
      records: [{ ...page.records[0], updatedAt: "2026-08-14T20:46:44Z" }],
    }} />);
    expect(screen.getByText(/23:46:44/)).toBeInTheDocument();
  });
});
