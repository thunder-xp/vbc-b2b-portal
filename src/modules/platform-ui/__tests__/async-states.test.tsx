import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";
import { RouteErrorState } from "../RouteErrorState";

describe("platform async states", () => {
  it("renders an actionable empty state", () => {
    render(<EmptyState actionHref="/new" actionLabel="Создать" message="Начните работу." title="Записей пока нет" />);
    expect(screen.getByRole("link", { name: "Создать" })).toHaveAttribute("href", "/new");
  });

  it("announces loading without forcing motion", () => {
    render(<LoadingState label="Загрузка заказов" rows={2} />);
    expect(screen.getByRole("status", { name: "Загрузка заказов" })).toHaveAttribute("aria-busy", "true");
  });

  it("provides retry, escape, and safe correlation details", () => {
    const reset = vi.fn();
    render(<RouteErrorState correlationId="safe-digest" escapeHref="/cabinet" escapeLabel="В кабинет" message="Повторите попытку." reset={reset} title="Раздел недоступен" />);
    screen.getByRole("button", { name: "Повторить" }).click();
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByText(/safe-digest/)).toBeInTheDocument();
  });
});
