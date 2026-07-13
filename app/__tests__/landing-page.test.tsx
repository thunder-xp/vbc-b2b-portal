import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../page";

describe("landing page", () => {
  it("presents the public entry page fully in Russian", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Партнёрская платформа" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NOVOTECH/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    expect(screen.getByRole("link", { name: "Стать партнёром" })).toHaveAttribute(
      "href",
      "/auth/register",
    );
    expect(screen.getByRole("heading", { name: "Возможности партнёра" })).toBeInTheDocument();
    expect(screen.getByText("Каталог B2B")).toBeInTheDocument();
    expect(screen.getByText("Партнёрские цены")).toBeInTheDocument();
    expect(screen.getByText("Наличие и поступления")).toBeInTheDocument();
    expect(screen.getByText("Проектные спецификации")).toBeInTheDocument();
    expect(screen.getByText("Запросы на резерв")).toBeInTheDocument();
    expect(screen.getByText("Документы")).toBeInTheDocument();
    expect(screen.getAllByTestId("capability-icon")).toHaveLength(6);
  });
});
