import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "../PageHeader";

describe("PageHeader", () => {
  it("supports a compact working header without changing the default contract", () => {
    const { container, rerender } = render(<PageHeader compact title="Финансы" />);
    expect(container.querySelector('header')).not.toHaveClass("border-b", "pb-5");
    expect(container.querySelector('p')).toBeNull();
    rerender(<PageHeader title="Финансы" />);
    expect(container.querySelector('header')).toHaveClass("border-b", "pb-5");
  });
  it("renders one page heading with description and actions", () => {
    render(
      <PageHeader
        actions={<button type="button">Создать</button>}
        breadcrumbs={<a href="/admin">Администрирование</a>}
        description="Описание раздела"
        eyebrow="Рабочая область"
        filters={<label>Поиск<input /></label>}
        status={<span>Активно</span>}
        title="Спецификации"
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Описание раздела")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Хлебные крошки" })).toBeInTheDocument();
    expect(screen.getByLabelText("Поиск")).toBeInTheDocument();
  });
});
