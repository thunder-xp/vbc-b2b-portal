import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicCctvCalculator } from "../components/PublicCctvCalculator";

describe("PublicCctvCalculator", () => {
  it("renders the guided Russian flow without B2B purchase actions", () => {
    const { container } = render(<PublicCctvCalculator locale="ru" />);

    expect(screen.getByRole("heading", { name: "Подберём систему видеонаблюдения" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.queryByText(/корзин/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/смет/i)).not.toBeInTheDocument();
    expect(container.querySelector('form[action="/calculator/cctv/result"]')).not.toBeNull();
  });

  it("calculates explicitly from step three without a review step", () => {
    const serviceOptions = [{ objectType: "house" as const, requestServiceType: "ai_scenario_programming" as const,
      labelRu: "Программирование AI-сценариев", labelRo: "Programarea scenariilor AI" }];
    render(<PublicCctvCalculator locale="ru" serviceOptions={serviceOptions} />);
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
    expect(screen.getByText("Программирование AI-сценариев")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать систему" })).toHaveAttribute("type", "submit");
    expect(screen.queryByText("Проверьте параметры")).not.toBeInTheDocument();
  });

  it("provides localized controls and preserves minimum touch targets", () => {
    render(<PublicCctvCalculator locale="ro" />);
    fireEvent.click(screen.getByRole("button", { name: "Continuă" }));

    expect(screen.getByRole("button", { name: "Camere în interior: micșorează" })).toHaveClass("size-12");
    expect(screen.getByRole("button", { name: "Camere în interior: mărește" })).toHaveClass("size-12");
  });

  it("restores governed values when a result is modified", () => {
    render(<PublicCctvCalculator locale="ru" initialInput={{
      locale: "ru", objectType: "warehouse", indoorCameraCount: 8, outdoorCameraCount: 4,
      quality: "maximum", archiveDays: 30, cableLength: 300,
      cameraInstallationRequested: true, cableLayingRequested: false,
      commissioningRequested: true, remoteViewingRequested: true, aiScenarioProgrammingRequested: false, backupPower: true,
    }} />);

    expect(screen.getByRole("button", { name: "Склад" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("8")).toHaveAttribute("name", "indoor");
    expect(screen.getByDisplayValue("300")).toHaveAttribute("name", "cable");
  });
});
