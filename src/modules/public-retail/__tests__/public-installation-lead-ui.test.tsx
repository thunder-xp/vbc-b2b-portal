import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions/installation-lead.actions", () => ({
  submitPublicInstallationLeadAction: vi.fn(),
}));

import { PublicInstallationLeadForm } from "../components/PublicInstallationLeadForm";

describe("public installation lead form", () => {
  it("renders the low-friction Russian fields and safe prefill", () => {
    render(<PublicInstallationLeadForm locale="ru" objectType="warehouse" sourcePath="/calculator/cctv/result" submissionKey="20000000-0000-4000-8000-000000000002" systemType="cctv" />);
    expect(screen.getByRole("textbox", { name: "Имя" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Телефон" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Город / населённый пункт" })).toHaveAttribute("list");
    expect(screen.getByRole("combobox", { name: "Тип объекта" })).toHaveValue("warehouse");
    expect(screen.getByRole("combobox", { name: "Система" })).toHaveValue("cctv");
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить консультацию" })).toBeInTheDocument();
  });

  it("renders authored Romanian labels", () => {
    render(<PublicInstallationLeadForm locale="ro" objectType="office" sourcePath="/installation" submissionKey="20000000-0000-4000-8000-000000000003" systemType="access_control" />);
    expect(screen.getByRole("textbox", { name: "Nume" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Oraș / localitate" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Sistem" })).toHaveValue("access_control");
    expect(screen.getByRole("button", { name: "Solicită consultanță" })).toBeInTheDocument();
  });
});
