import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import Home from "../page";

describe("landing page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "ru";
  });

  it("renders the complete Russian partner landing by default", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Партнёрская платформа Novotech" })).toBeInTheDocument();
    expect(screen.getByText("Платформа для дистрибуционных партнёров")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Войти" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Стать партнёром" })).toHaveAttribute("href", "/auth/register");
    expect(screen.getByRole("heading", { name: "Добро пожаловать в кабинет партнёра" })).toBeInTheDocument();
    expect(screen.getByText("Надёжность поставок")).toBeInTheDocument();
    expect(screen.getByText("Актуальные данные из 1С")).toBeInTheDocument();
    expect(screen.getByText("Комплексные решения")).toBeInTheDocument();
    expect(screen.queryByText(/Cisco|Dell|Lenovo|Arista|Palo Alto/i)).not.toBeInTheDocument();
  });

  it("switches to Romanian without reloading and marks the selected language", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Выбрать язык" }));
    const romanianOption = screen.getByRole("menuitemradio", { name: "RO — Română" });
    await user.click(romanianOption);

    expect(screen.getByRole("heading", { name: "Platforma Partenerilor Novotech" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devino partener" })).toBeInTheDocument();
    expect(window.localStorage.getItem("novotech-landing-locale")).toBe("ro");
    expect(document.documentElement.lang).toBe("ro");

    await user.click(screen.getByRole("button", { name: "Selectați limba" }));
    expect(screen.getByRole("menuitemradio", { name: "RO — Română" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("menuitemradio", { name: /English/i })).not.toBeInTheDocument();
  });

  it("restores a persisted Romanian selection", async () => {
    window.localStorage.setItem("novotech-landing-locale", "ro");
    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Platforma Partenerilor Novotech" })).toBeInTheDocument();
    });
  });

  it("closes the language menu on outside click and Escape", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const trigger = screen.getByRole("button", { name: "Выбрать язык" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("main"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
